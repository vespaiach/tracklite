# Tracklite: Technical design

Companion to `docs/tracklite-spec.md`. The spec says *what* the product does; this file records only the technical decisions the spec leaves open. If they disagree, the spec wins and this file gets fixed.

## 1. Architecture

### 1.1 What runs where

```
 browser ──HTTPS──▶ reverse proxy ──▶ tracklite-web (next start) ──▶ PostgreSQL 18
                                              │
                                              ▼
                                   email provider HTTP API
 scheduler ──POST /api/cron/outbox, every minute──▶ (through the proxy)
 uptime checker ──GET /health, /health/worker──▶ (through the proxy)
 email provider ──POST /webhooks/email──▶ (through the proxy)
```

Deployment (servers, the reverse proxy, the scheduler, process supervision, deploys, rollbacks, backups and log retention) is maintained outside this repository. The app expects the following from it.

| Part | What it does |
|---|---|
| **Reverse proxy** | Terminates TLS, redirects HTTP to HTTPS and sends HSTS and the 4.9 headers (SEC-005). It passes the original `Host` (or sets `X-Forwarded-Host`), which Next.js compares with `Origin` on every server action (4.4). It also overwrites `X-Forwarded-For` with the client's address, and the app reads the rightmost entry for SEC-001's per-IP limit, so a client can't choose the address that limit counts. Its access log drops the `token` query parameter (SEC-007). Its upstream timeout is over 60 seconds, so an outbox run (1.4) isn't cut off. |
| **tracklite-web** | `next start`: the server-rendered pages and their server actions (1.7), `/api/cron/outbox`, `/api/client-errors`, `/health`, `/health/worker`, `/webhooks/email`. Restarted if it exits. It is the only app process. |
| **Scheduler** | Calls `POST /api/cron/outbox` once a minute with `Authorization: Bearer {CRON_SECRET}` (1.4, 1.6). Any cron-like service works; a missed or overlapping call is harmless. |
| **PostgreSQL** | All state, including the outbox and the notification queue. |

**Batch H.** The code is moving to this design one task at a time (`docs/execution-plan.md`, batch H). Until H20, the old client-rendered screens under `src/app/(signed-in)/[[...path]]` (and, until H13, the `(signed-out)` page stubs that load the same `ClientPage`) and the `/api` routes they call (3.3) still run beside the new pages, and until H21 notifications are still sent by `scripts/worker.ts`. Where the code and this file differ, the open H row says which way the code goes.

### 1.2 Request flow

There are three ways in: a page, a server action and a route handler. All three call the same use cases and queries (1.8), so every read and write goes through the same permission checks (SEC-006).

**Pages.** A page is a React Server Component under `src/app/` (1.7):

1. The `(signed-in)` layout reads the session cookie with `pageMember` (`src/app/_server/session.ts`) and redirects a signed-out visitor to `/sign-in?next=…` (STD-1). `pageMember` doesn't renew the session (2.2), since a server component can't set cookies; actions and, until H20, the `/api` routes do. Pages in `(signed-out)` read the session only to send a signed-in member on (6.1).
2. The page reads its data through `src/queries` (D-64), passing the member as `actor`. An admin-only read starts with `assertAdmin(actor)`, so a member's page shows STD-2's message in the page area. A query returns `null` for a missing target, and the page calls `notFound()` (STD-4).
3. Each data region renders inside its own `Region` (1.7, STD-11), so one failed query fails only its region.

**Server actions.** Every action is a function in a route's `actions.ts`, wrapped by the adapter in `src/app/_server/action.ts` (D-63), which runs these steps in order:

1. Next.js has already refused a cross-site call: it compares `Origin` with the host (4.4).
2. Read the session with `actionMember` (`src/app/_server/session.ts`, over `requireSession` in `infrastructure/identity/session.ts`), which only says who is asking and checks no role. It renews a session idle over an hour with `cookies().set` (2.2). An action declared `"public"` (sign-in, password resets, invitation lookups and acceptance, sign-out, first-admin setup) skips it.
3. Parse the input with the action's Valibot schema (D-42), failing fast with an `invalid` error. `FormData` input is turned into a plain object first. `parseInput` (`src/app/_server/parse-input.ts`) builds the error, and `apiRoute` uses it too. The schema checks shape and format only, with the spec's own messages, and passes the parsed, trimmed values on.
4. Call one use case from `src/application/` (1.8) with the member as `actor`, a `UnitOfWork` wired with the repositories the use case names, and the input. The use case checks permissions (4.10), loads aggregates, runs their rules and saves them; the unit of work commits the change and its events together (spec §12).
5. On success, call `refresh()` from `next/cache`, so the page's server components render again with current data, and return `{ ok: true, data }`. `data` is only what the client needs next, such as a new issue's ID.
6. Turn a thrown `DomainError` into `{ ok: false, error: { kind, message, fields? } }` (3.2), and **rethrow anything else**, which Next.js reports through `onRequestError` (4.8) and the browser sees as a failed call (STD-9).
7. Write one JSON `action/call` line, without inputs or tokens (SEC-007, 4.8), also before rethrowing. A signed-in call names the member as `actor` by username, so an unexpected error's `route/request-failed` line can be matched to the member (OPS-007.4).

**Route handlers.** Only callers that aren't the app's own pages use routes: the scheduler (`/api/cron/outbox`), the uptime checker (`/health`, `/health/worker`), the email provider (`/webhooks/email`), and the browser's error reporter (`/api/client-errors`, which must work after a page has crashed, 4.8). Each checks its own caller (a bearer secret, a signature, or the origin check of 4.4) and calls one use case. Until H20, the `/api` routes of 3.3 also run, through `apiRoute`, which keeps the same steps with HTTP statuses.

### 1.3 Time

Every expiry and time-window check uses the database's `now()` inside the query (`expires_at > now()`, `send_after <= now()`). The app server's clock is never used for these, so there's only one clock to trust. The app's connection sets the session time zone to UTC, so a window such as `interval '7 days'` is always exactly 168 hours, even across a daylight-saving change. The one exception is the webhook's 5-minute signature window (5.4), which compares the provider's timestamp with the app's clock, since there's no row to compare in SQL. Tests move stored timestamps into the past rather than faking the clock. For example, a test for REQ-050.4 sets `expires_at = now() - interval '1 minute'`.

### 1.4 Outbox and cron route (DEC-004)

Work that happens after an action, sending notifications and cleanup, runs in `POST /api/cron/outbox`, which the scheduler calls every minute (D-70). There is no long-running worker process.

**Writing the outbox.** When a use case's unit of work commits (1.8), it first hands the events pulled from every saved aggregate to the outbox writer, `notifications`' infrastructure, on the same transaction. For each event the writer:
- mirrors the text's mentions into `mentions` (2.5), since pages show them at once;
- decides the recipients: the newly added assignees (REQ-043) or the newly mentioned members (REQ-044), minus the actor;
- takes the snapshot each message needs (2.6), so the email can still be built if the issue or project is deleted before the run (REQ-045.7);
- inserts one `outbox_events` row (2.6) holding all of that, unless there are no recipients.

So the action, its mentions and its event commit or roll back together.

**A run.** The route answers `401` unless `Authorization` is `Bearer {CRON_SECRET}`, compared in constant time like `SETUP_SECRET` (4.6). It then works for at most **50 seconds**, checking the time before each step, so it ends before the next call is due, and answers `204`. A run never holds a transaction open during a provider call, and no single event's or delivery's failure ends it.

1. **Heartbeat.** Upsert the `job_runs` row named `outbox` with `last_run_at = now()` (2.6), read by `/health/worker` and the status page (OPS-005, REQ-053).
2. **Events.** Repeatedly, in one transaction each: claim the oldest unpublished, due event (`published_at is null and next_attempt_at <= now()`, `order by occurred_at for update skip locked limit 1`), run `record-notifications` for it (2.6), and set `published_at = now()`. If the handler throws, the transaction rolls back, and a second short one sets `attempts + 1` and `next_attempt_at` 1, 4 and 10 minutes ahead, then hourly; it logs `outbox/event-failed` with the event's `id` and `type` (4.8). An event is never given up on. The step ends when no event is due.
3. **Deliveries.** Run `send-due-deliveries` passes while a pass claims a full 10 and time is left. A pass works as before batch H: claim up to 10 pending, due, unleased deliveries with a 2-minute lease (D-46), then for each one, the drop checks, the send outside any transaction, and the record, guarded by the lease (2.6). Two minutes covers a full pass at the provider's 10-second timeout (5.2): 10 × 10 s.
4. **Cleanup (DATA-004).** If the `job_runs` row named `cleanup` is missing or older than an hour, claim it (`update … where last_run_at <= now() - interval '1 hour' returning`, or an insert `on conflict do nothing`), so two overlapping runs never both clean, then delete in chunks (2.7) while time is left. Unfinished chunks wait for the next hour.
5. **Metrics.** One `outbox/metrics` info line (4.8): `events` (unpublished), `pending`, `due` and `oldestDueSeconds` (counted in SQL against `now()`), and the `sent`, `failed` and `dropped` counts of this run. No recipients, no text.

**Errors stay where they happen.** Each event, each delivery and the cleanup run inside their own `try`. A delivery's unexpected error counts as a failed attempt (2.6) and logs `outbox/delivery-failed` with the delivery's `id` and channel, never the recipient or text (SEC-007); a failed send logs nothing more, because `sendEmail` already logged its `mail/*` line (D-53). An error outside them (heartbeat, claim, loading drop-check data), such as during a PostgreSQL restart, logs `outbox/run-failed`, and the route answers `500`; claimed deliveries return when their lease runs out, and the next run retries.

**Where the code lives (1.8).** `src/app/api/cron/outbox/route.ts` checks the secret and the time budget and calls the use cases in `src/application/notifications/`: `record-notifications`, `send-due-deliveries` and `clean-up`. The Delivery entity (`domain/notifications/`) decides which notifications are still wanted and what a failed attempt leads to. The claim, lease and `skip locked` SQL is in `infrastructure/notifications/`, with the channels' senders (2.6). In development, `npm run cron` calls the route every minute.

**New background work** is an event type with a handler in step 2, or a step of the run with its own `job_runs` row, like cleanup. The web process never defers work past its response (no `after()`, timers or unawaited promises).

How it meets DEC-004:

- **Survives a restart.** Events and deliveries are table rows, so nothing is lost in a crash or deploy. A run cut off mid-way leaves its unpublished events for the next run, and its claimed deliveries are retaken once their lease runs out, at most 2 minutes later.
- **No paid queue and no extra process.** PostgreSQL plus a route of the web app, called by the deployment's scheduler.
- **Handled once, delivered at least once.** An event's notifications and its `published_at` commit in one transaction, and `notifications` is unique on `(event_id, recipient_id)`, so replaying an event adds nothing (2.6). A delivery is sent again if a run dies between the provider accepting it and the record, or if a send outlasts its lease; both sends carry the delivery's `id` as Resend's `Idempotency-Key`, so Resend drops the duplicate (section 5).
- **Safe to run twice.** `skip locked`, the lease and the `cleanup` claim let two runs overlap (a slow run and the next call) without doing anything twice.

### 1.5 Emails sent during the request

Invitations (REQ-001) and password reset links (REQ-050) are **not** queued. They're sent inside the action, because STD-6 needs to know whether the send worked before answering.
- The token row is written first, then the email is sent, all in one transaction.
- If the send fails, the transaction rolls back, so no working link exists that nobody received, and the action returns the `unavailable` error (STD-6).

All email goes through one `sendEmail()` (5.2).

### 1.6 Configuration

- Settings come from environment variables: `.env.local` in development, and the deployment's server config in production (OPS-006).
- The app checks them at startup and refuses to start if any are missing.
- Settings: `DATABASE_URL`, `APP_URL` (for links in emails), `CRON_SECRET` (1.4), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `EMAIL_FROM` (section 5). `CRON_SECRET` must be at least 32 characters, like `SETUP_SECRET`, and the scheduler sends it. `MAILPIT_HOST` and `MAILPIT_PORT` are optional and default to `localhost` and `8025`. `SETUP_SECRET` is optional; when set it must be at least 32 characters (OPS-001.6), and without it the welcome screen can't create the first admin (4.6).
- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are required only when `NODE_ENV` is `production`; development sends through Mailpit and tests through the in-memory outbox (5.2).
- A production build (`next build` with `NODE_ENV=production`) loads the route modules, which read the settings, so the build step needs the same settings as the running app, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` included, or it fails with "Missing environment variables" (found by L03).
- Tests run against `TEST_DATABASE_URL`, which must differ from `DATABASE_URL`. Before each run its schema is dropped and the migrations applied afresh.
- In the `unit` test project, `src/test/next-mocks.ts` mocks `next/headers` (the request's cookies and headers, set with `setNextRequest` from `src/test/next-request.ts`), `next/cache` (`refresh` is a `vi.fn()`) and `next/navigation` (`redirect` throws an error carrying `url`; `notFound` throws), so tests call actions and layouts directly.

### 1.7 Pages and client components

Next.js App Router with React Server Components (D-10). A page renders on the server with current data; client components handle what needs the browser: forms, pickers, the board's drag and drop, toasts. There is no client-side data store.

**Layout.**
- `src/app/layout.tsx` holds `<html>`, `<body>`, the fonts (`next/font/google`, served from the app so the CSP's `font-src 'self'` holds), the Track Lite stylesheet, the toast provider and the error reporter (4.8).
- `src/app/(signed-out)/` holds `/sign-in`, `/forgot-password`, `/reset-password`, `/invite` and `/welcome`; `src/app/(signed-in)/` holds every other API-004 page, under a layout that renders the shell and sidebar (6.2). Each route folder has its `page.tsx`, an `actions.ts` for its server actions, and its client components.
- `src/proxy.ts` only sets the Content Security Policy and `Referrer-Policy` (4.9), and forwards the requested path and query to the app in the `x-request-path` request header, replacing any the browser sent, since a layout isn't given the address. Redirects happen in layouts and pages.
- Every page renders per request: it reads cookies, and the CSP nonce (4.9) needs a fresh render. Nothing is cached between requests, which matches "pages show current data when they load" (spec §12). There's no polling: REQ-041.6 and REQ-053.7 expect an open page to stay as it is until it's reloaded or the member acts.

**Signed-in state (STD-1).**
- The `(signed-in)` layout calls `pageMember`; with no valid session it redirects to `/sign-in?next={the requested path and query}`, read from `x-request-path`. A path that fails the SEC-009 rule below, or a request the proxy skipped (a router prefetch), redirects to plain `/sign-in`. `isInAppPath` and `returnTarget` in `src/lib/return-to.ts` hold that rule for both ends.
- `/sign-in`, `/forgot-password` and `/` send a signed-in member to `/my-issues`.
- **First admin (OPS-001).** `/sign-in` checks `setupNeeded` and redirects to `/welcome` while it's true. Every signed-out visitor reaches `/sign-in`, so a blank install always lands on the welcome screen. `/welcome` goes to `/sign-in` once setup is no longer needed.
- **Return after sign-in (SEC-009).** `next` is used only if it starts with `/` but not `//` or `/\`; anything else goes to `/my-issues`. So `?next=https://evil.example` can't send anyone off-site.
- **Mid-edit (REQ-007.4).** An action whose session has ended returns the `signedOut` error, and the client's action helper sends the browser to `/sign-in?next={current address}`, except on the signed-out pages.

**Reads.** A page or layout calls `src/queries` (D-64) and passes plain contract types (3.5) to client components as props. Each data region is its own async server component inside a `Region`, so regions load and fail independently.

**Writes.** A client component calls its route's server action, through `useActionState` for forms and `startTransition` for single controls (a picker, a board move). The action's `refresh()` (1.2) re-renders the page's server components, so whatever the page shows is read again; there are no cache tags to keep in step. A result with `ok: false` is shown by the component: field errors next to their fields (STD-3), a conflict in the editor (STD-8), and anything else as a toast (STD-9). A thrown call (network, a `500`, or an action ID from an older build after a deploy) toasts "Couldn’t save. Try again."
- **Optimistic board moves (NFR-005, REQ-026).** The board keeps its columns in `useOptimistic`; a drop updates them inside the action's transition. On `ok: false` or a thrown call, the transition ends without the new data, so the card returns to where it was, and the board toasts the server's message, or "Couldn’t move WEB-42" for a network error or `5xx`. A `404` for a card deleted meanwhile (REQ-026.5) needs nothing more: the refresh drops it.
- **Request IDs (STD-5).** `useRequestId()` (`src/components/useRequestId.ts`) returns `[requestId, renew]`: it generates `crypto.randomUUID()` once, when a create form opens, and reuses it for every retry of that submit; the form calls `renew()` when it is reset.
- **URL state.** List filters, search and sort live in the URL (REQ-040), and the list page reads them from `searchParams`. The parameters use enum values as their keys, such as `status=in_progress`. A filter or sort change pushes a history entry with `router.push`; search uses `router.replace`, so Back doesn't step through each typed word. Form drafts live in component state.

**Loading states (STD-7).** Each `Region`'s Suspense fallback is `DelayedFallback` (`src/components/region/`), which renders nothing for 300 ms and then "Loading…" (D-65). Navigations between pages show the same fallback from each route's `loading.tsx`.

**Regions (STD-11).** `Region` (`src/components/region/`) wraps a data region in Suspense and an error boundary made with `catchError` from `next/error` (D-66). The failed view reads "Couldn’t load {what}." with **Try again**, which calls the boundary's `retry()`: it re-fetches the route's server data, like `router.refresh()`, and re-renders the region. A render crash in the region shows the same view and reports `zone-crashed` with the first component name of React's `componentStack` (4.8). Since `catchError`'s fallback gets no `componentStack`, an inner class boundary reports the crash in `componentDidCatch` and then rethrows it to the `catchError` boundary. A server component's failure reaches the browser with a `digest` and is already logged by the server (OPS-007), so it shows the failed view without a report. `redirect()` and `notFound()` pass through both boundaries. A region that showed data and fails on a later render (after an action's `refresh()`) shows the failed view, since a server-rendered region keeps no copy of its old data (STD-11.4). Regions: sidebar projects, board, list, My issues, issue fields, project details, comments, labels, project settings, archived projects, profile, members (members and invitations together), notification status. Empty states stay in each region's component, since each has its own copy.

**Unsaved text (REQ-035).** `useLeaveGuard(message)` (D-67, `src/components/leave-guard.tsx`) is active while a comment box holds text or a description editor has unsaved changes; the caller passes `null` otherwise. It registers in a module-level set that the app's link component, `Link` in the same file, reads: its `next/link` `onNavigate` asks with `window.confirm(message)` of the first active guard and calls `preventDefault()` on Cancel. Every in-app link uses this `Link`, not `next/link` directly. It also listens for `beforeunload`, so closing or reloading the tab shows the browser's prompt. The browser's Back and Forward buttons aren't caught, since the App Router has no blocking API (REQ-035).

**Toasts (STD-9).** `ToastProvider` (`src/components/toast.tsx`), a small client context in the root layout, shows one message at a time for 5 seconds with no dismiss; a new one replaces it and restarts the 5 seconds. Client components show one with `useToast()(message)`.

### 1.8 Layers and bounded contexts

The server code is split two ways: into **layers**, by what a file may depend on (D-60), and inside each layer into the five **bounded contexts**, `identity`, `projects`, `issues`, `comments` and `notifications`, by what part of the product it is about.

```
src/
├── app/                 pages, layouts, actions.ts per route, client components; route handlers:
│                        /api/cron/outbox, /api/client-errors, /health, /webhooks; _server/action.ts (the adapter)
├── domain/<ctx>/        entities, value objects, repository interfaces, events. No next/*, Drizzle or server-only
├── application/<ctx>/   one file per use case; depends on domain interfaces and the UnitOfWork interface only
├── infrastructure/      db client, schema and tables, mappers, Drizzle repositories, the unit of work,
│                        the outbox writer, email, tokens, passwords, log, config
├── queries/             read-only SQL for pages, returning src/contract types
├── contract/            response types and enum values shared by queries, actions and client components
└── components/, lib/    the Track Lite kit, Region and other client building blocks; the Markdown module
```

**Layers and their imports.** `architecture.test.ts` fails on an import against this table.

| Layer | May import | Holds |
|---|---|---|
| `domain/**` | `domain/**`, `src/contract` (enum values and types, D-44), `valibot`, `fractional-indexing` (board positions) | the rules: entities, value objects, domain events, `DomainError`, repository interfaces. No database, framework or I/O |
| `application/**` | `domain/**`, `application/**`, `src/contract` | use cases: load through repository interfaces, call entities, save, inside a `UnitOfWork` |
| `queries/**` | `domain/**` (value objects, `assertAdmin`), `infrastructure/**/tables.ts`, `infrastructure/db` and its `Transaction`/`Executor` types in `infrastructure/transaction`, `src/contract`, and packages other than `next/*` (Drizzle) | the reads behind pages (D-64) |
| `infrastructure/**` | anything but `app/` and `components/` | Drizzle tables, mappers and repositories, the unit of work, the outbox writer, channels, email, tokens, passwords, log, config |
| `app/**` | everything | pages and route handlers, and the actions, which are the composition root: they wire infrastructure into use cases |

Nothing under `domain`, `application` or `queries` imports `next/*`. `src/contract/` imports nothing. `src/lib/markdown/` is shared by the browser and `infrastructure/` (4.7). Test files may build fixtures across layers.

**Bounded contexts.** Each layer has one folder per context; `shared/` holds what every context uses (`domain/shared/` for `DomainError`, `AggregateRoot`, the shared value objects and events; `infrastructure/` itself for db, log, email and the rest).

| Context | Domain | Use cases (`application/<ctx>/`) |
|---|---|---|
| `identity` | `Member` (`FullName`, `Username`, `Role`; the last-admin rule), `Invitation`, `PasswordReset`; `assertAdmin` | sign-in, sign-out, sessions, profile, password change, setup, invitations, password resets, members, client error reports, expired account rows |
| `projects` | `Project` with its labels (`ProjectKey`, `ProjectName`, `LabelName`, `LabelColor`) | create, update (rename, archive or unarchive, or a description save: one `PATCH`), delete; create, update and delete labels |
| `issues` | `Issue` (`IssueId`, `IssueTitle`, `IssueStatus`, `IssuePriority`) | create, update one field, move, delete |
| `comments` | `Comment` (`create` records `CommentPosted`; `edit` is the author's only and returns `{ conflictWith }` on a stale version; `assertDeletableBy` the author or an admin) | post on an issue or a project, edit, delete |
| `notifications` | `Delivery` (which notifications are still wanted, what a failed attempt leads to) | record notifications, send due deliveries, clean up, notification stats, outbox health, receive an email event |

**Allowed dependencies between contexts.** Unchanged from the context map: `comments` → `issues`, `projects`; `issues` → `projects`; `notifications` → `comments`, `issues`, `projects` (reads for its drop checks and snapshots); every context → `identity` and `shared`. No context but `notifications` depends on `notifications`; the unit of work reaches it only through the outbox writer interface (D-62). No cycles. Within a layer, a context imports another context's files directly; the direction rule above still holds.

**Entities and value objects (D-61).**
- An **entity** is a class with a `private constructor(props)` that keeps its state in a private `#props` field (no parameter properties, which `erasableSyntaxOnly` forbids) and exposes it read-only as `props`. Each change replaces `#props` with a new object, so the props a repository saw at load stay as they were and `save` can diff against them. `static create(input)` runs the spec's rules for a new one and records its events; `static rehydrate(props)` rebuilds a stored one and runs no rules, so a rule added later never makes an old row unloadable. Each change is a method named for the domain's word (`retitle`, `assign`, `move`, `archive`) that checks its rule, changes the entity and records events, or throws a `DomainError` (3.2). A refusal whose message needs a read returns instead of throwing: an issue's stale description save returns `{ conflictWith }`, the member who saved last, and the use case throws `conflict` with their name.
- An aggregate root extends `AggregateRoot`, which keeps recorded events and hands them over once from `pullEvents()`.
- A **value object** is a small immutable class with a `private constructor` and `static from(raw)`, which validates, normalises (keys uppercase, usernames lowercase) and throws `DomainError("invalid", …)` with the spec's message. It may export its Valibot schema, which action schemas reuse (D-42). Identifiers (`IssueId` such as `WEB-42`, `ProjectKey`, `Username`, `RequestId`, `Uuid`) are value objects made at the edge and passed inward, so an unchecked string doesn't compile, and lookups ignore case without each query doing it. They live in `domain/shared/identifiers.ts`; each has a `static schema` that validates and builds the instance, so body schemas use it and refuse with field messages, and the value sits in `.value`. A path segment goes through `tryFrom(IssueId, raw)`, which gives `undefined` instead of throwing, so a malformed ID in a path is `notFound` like an unknown one. An `IssueId` also carries its `key` and `number`.
- Entities hold only rules the spec states, and leave to the database the rules it can hold (unique issue numbers, keys and label names). They may use `src/contract/` enum types, the words server and client share (D-44). Their tests sit next to them and use no database.

**Repositories (D-62).** Each aggregate has a repository interface in its domain folder (`IssueRepository`: `get`, `idForRequest` (STD-5 repeats), `nextNumber`, `firstPositionIn`, `neighboursAt` (the cards around a move's place), `save` and `remove`), written in the domain's terms. `infrastructure/<ctx>/` implements it with Drizzle (`drizzle-issue-repository.ts`), with a mapper (`issue-mapper.ts`) between rows and entities (statuses through `IssueStatus.from`). `get` reads the root with `select … for update` and its parts; `save` writes only what changed and tells the unit of work the aggregate was saved. A repository takes the unit of work's transaction scope and never opens a transaction. A use case that only needs to check another aggregate (the project's labels, whether it's archived) uses that aggregate's repository through its interface. `ProjectRepository` (`domain/projects/`, over `drizzle-project-repository.ts` and `project-mapper.ts`) has `get(key)` (the project and its labels, `for update`), `hold(key)` (the same `for share`, or `undefined`: a write inside the project keeps it from being archived until commit, REQ-013.4), `withLabel(labelId)` (the label's project `for update`, or `notFound` "That label no longer exists"), `labelIdsOf(projectId, ids)`, `save` and `remove`. The archived rule is `Project.assertWritable()`: issue use cases call it on `projects.hold(id.key)` before `issues.get(id)`, so the project is locked before the issue as before, and create calls it on `projects.get(key)`, whose lock serializes issue numbers. `CommentRepository` (`domain/comments/`, over `drizzle-comment-repository.ts` and `comment-mapper.ts`) has `projectKeyOf(id)` (the key of the project a comment sits in, through its issue or directly), `get(id)` (`for update`), `idForRequest`, `save` and `remove`; a missing comment is `notFound` "This comment was deleted". Comment edits and deletes call `assertWritable()` on `projects.hold(await comments.projectKeyOf(id))` before `comments.get(id)`; posting on an issue holds `projects.hold(id.key)` and then `issues.get(id)` for the issue's id, and posting on a project holds the project itself (`notFound` when missing). Other contexts read members through `MemberDirectory` (`domain/identity/`: `withUsernames` for assignee checks, `fullNameOf` for a conflict's message); `MemberRepository` (`get`, `getByUsername`, `activeByEmail`, `lockActiveAdminIds`, `lockAgainstNewMembers`, `count`, `save`) loads and saves `Member` entities for identity's own use cases, and `SessionRepository` starts and ends sessions.

**Unit of work (D-62).** `application/shared/unit-of-work.ts` declares `UnitOfWork<R>`, with one method, `run(work: (repositories: R) => Promise<T>)`. A use case names the repositories it needs as `R`, such as `{ issues: IssueRepository; projects: ProjectRepository }`. `infrastructure/unit-of-work.ts` implements it with `db.transaction`: it builds `R` from each context's repository factory on the transaction, runs the work, then, before commit, pulls the events of every saved aggregate and hands them to the outbox writer on the same transaction (1.4). A thrown error rolls back the aggregate's rows and its events together. A repository factory takes the scope `{ tx, saved }` (`TransactionScope`) and calls `saved(aggregate)` from `save`; until H21 the outbox writer is the in-process `publishAll` to the `notifications` subscription. Adding a context adds a factory in its own `infrastructure/<ctx>/`; the unit of work stays generic.

**Use cases.** One file per use case in `application/<ctx>/` (`create-issue.ts`, …), exporting one function that takes `actor` first (4.10), then the `UnitOfWork`, then the parsed input. An admin-only use case calls `assertAdmin(actor)` before anything else. Then, inside `run`: load the aggregate, load what a rule needs from other aggregates, call the entity, save. It returns what the caller needs next (an ID, or nothing), never a page's data, which comes from `queries/`. A use case holds no rule and no SQL of its own. A helper two use cases share goes in a file named for its area in the same folder. Until H20, an `/api` route passes a context's wired unit of work (`issueWork` in `infrastructure/issues/issue-work.ts`, `projectWork` in `infrastructure/projects/project-work.ts`, `commentWork` in `infrastructure/comments/comment-work.ts`) and reads its response through `queries/` (`updatedIssue`, `updatedProject`, `updatedLabel`, `updatedComment`) after the use case commits.

**Read side (D-64).** `src/queries/` holds the reads behind pages. It reads any context's tables in joins, writes none (M16 fails on a write), and returns `src/contract/` types (D-44) without building entities: rendering a board of 200 cards changes nothing, so there is no rule to protect. A query takes `actor` first like a use case; an admin-only one calls `assertAdmin(actor)` first. A condition both a read and a repository need, such as finding an issue by its ID, lives in `queries/`, and the repository imports it.

**Aggregates.** Each is changed only through its entity, with one root locked per change.

| Aggregate | Context | Root and parts | Rules in its entity | Concurrency |
|---|---|---|---|---|
| Issue | `issues` | the `issues` row, its assignees and label ids | title (REQ-016); any status at any time, no workflow (REQ-017); assignees are active members (REQ-019); 0 to 10 labels of its own project (REQ-020); the position of a moved or re-statused issue (REQ-026, REQ-027); who may delete (REQ-023); who is newly assigned (REQ-043) | row lock, last save wins (REQ-026, D-59); `description_version` (STD-8) |
| Project | `projects` | the `projects` row, its key and its labels | name and key (REQ-009); an archived project is read-only (REQ-013); label name and colour (REQ-021) | row lock; `description_version` (STD-8) |
| Comment | `comments` | the `comments` row | only the author edits (REQ-033); the author or an admin deletes (REQ-034); the length limit (REQ-031) | `version` (STD-8) |
| Member | `identity` | the `members` row | the last admin (REQ-007.3, REQ-052.3); deactivate and reactivate (REQ-007, REQ-008); role changes (REQ-052) | row locks on the active admins (2.2) |
| Invitation, PasswordReset | `identity` | an `invitations` or `password_reset_tokens` row | state and which `410` (REQ-002, REQ-050); expiry is checked in SQL with `now()` (1.3) | row lock on the link (4.6) |
| Delivery | `notifications` | a `notification_deliveries` row and its batch's notifications | which notifications are still wanted, and what a failed attempt leads to (2.6, 1.4) | the run's lease (D-46) |

**Table ownership.** Only the owning context's infrastructure inserts, updates or deletes its tables. Others may read them in joins; splitting joins into calls would cost queries for nothing at this size. Enums and shared column helpers are in `infrastructure/schema.ts`; each context's tables are in `infrastructure/<ctx>/tables.ts`, and `drizzle.config.ts` reads them all. A `tables.ts` imports other contexts' `tables.ts` directly for foreign keys; the foreign-key graph runs `notifications` → `comments` → `issues` → `projects` → `identity`, with no cycles. Reads that cross the context map (label usage, issue counts per status (REQ-046.3), who a text mentions) live in `queries/`. `M16: a context writes only its own tables` fails on an `insert`, `update` or `delete` of another context's table outside test code; test files and `src/test/` (including the NFR-001 load data, `src/test/seed-load.ts`) may write any table for fixtures. To change another context's table, call a use case or repository its owner provides (`takeIssueNumber`, `markInvitationBounced`, `deleteExpiredAccountRows`).

| Context | Tables it owns |
|---|---|
| `identity` | `members`, `invitations`, `password_reset_tokens`, `sessions`, `sign_in_attempts`, `password_reset_requests`, `client_error_reports` |
| `projects` | `project_keys`, `projects`, `labels` |
| `issues` | `issues`, `issue_labels`, `issue_assignees` |
| `comments` | `comments` |
| `notifications` | `mentions`, `outbox_events`, `notification_batches`, `notification_deliveries`, `notifications`, `job_runs` |

**Glossary.** The words code, spec and UI share, by owning context. The code name is the table, class or column that holds the term in `src/` and `src/contract/`.

| Context | Term | Meaning | Code name |
|---|---|---|---|
| `identity` | member | a person with an account; `role` is `admin` or `member` | `members`, `Member`, `MemberSummary`, `Me` |
| `identity` | username | a member's lowercase handle, used in addresses and mentions | `username`, `Username` |
| `identity` | invitation | an admin's email invite; its state (Pending, Accepted, Revoked, Bounced, Expired) is derived (2.2) | `invitations`, `Invitation` |
| `projects` | project | a named container for issues, possibly archived | `projects`, `Project`, `ProjectSummary`, `archivedAt` |
| `projects` | key | a project's short uppercase code, reserved forever | `key`, `ProjectKey`, `project_keys` |
| `projects` | label | a coloured tag belonging to one project | `labels`, `Label`, `LabelColor` |
| `issues` | issue | a unit of work in one project | `issues`, `Issue` |
| `issues` | issue ID | the project key plus a number, `WEB-42`; the database `uuid` is never shown | `IssueId`, `number` |
| `issues` | status | where an issue is in the workflow; a board column | `status`, `IssueStatus` |
| `issues` | priority | how urgent an issue is | `priority`, `IssuePriority` |
| `issues` | position | an issue's sort key within its board column (2.4) | `position` |
| `issues` | assignees | the members responsible for an issue, any number or none (REQ-019) | `issue_assignees`, `Issue.assignees` |
| `comments` | comment | a message on one issue or one project | `comments`, `Comment`, `ThreadComment` |
| `notifications` | mention | an `@username` in a description or comment, mirrored as a row (2.5) | `mentions` |
| `notifications` | event | a fact an action recorded, waiting in the outbox to become notifications (1.4) | `outbox_events`, `DomainEvent` |
| `notifications` | outbox run | one call of the cron route: events, deliveries, cleanup (1.4) | `job_runs`, `/api/cron/outbox` |
| `notifications` | notification | one thing to tell a member: `assigned` or `mentioned` | `notifications`, `notificationKind` |
| `notifications` | batch | the notifications a recipient gets together about one target (2.6) | `notification_batches` |
| `notifications` | delivery | one batch sent over one channel, with its state | `notification_deliveries`, `Delivery`, `deliveryState`, `ProblemDelivery` |

**Permission checks** stay where 4.10 puts them: `assertAdmin(actor)` is an admin-only use case's or query's first statement, before any load. Ownership checks (who may delete an issue, edit or delete a comment) are entity methods the use case calls once the aggregate is loaded.

**Domain events.** `domain/shared/events.ts` holds `DomainEvent`, a typed union of the facts that cause notifications in R1: `IssueAssigned`, `DescriptionSaved` (issue or project), `CommentPosted` and `CommentEdited`. Each carries the actor, the target ids and, for text, the saved text; `IssueAssigned` carries the ids of the members newly added as assignees (REQ-043), from a create or an assignee change. Entities record them; the unit of work pulls them after the save and hands them to the outbox writer (1.4), which works out who a text newly mentions, since `notifications` owns `mentions`. Nothing publishes an event outside a unit of work, so a use case that forgets to save its aggregate also sends nothing.

## 2. Schema

PostgreSQL via Drizzle ORM, connected through the `postgres` (postgres.js) driver (`drizzle-orm/postgres-js`). Enums and column helpers are in `src/infrastructure/schema.ts`, and tables, columns, constraints and indexes in each context's `infrastructure/<ctx>/tables.ts` (1.8); `drizzle-kit generate` writes migrations to `migrations/`. This section records only why the schema is shaped as it is. Every table has a `uuid` id unless stated (`project_keys` is keyed by `key`, `job_runs` by `name`, `issue_labels` and `issue_assignees` by their pairs), and every timestamp is `timestamptz` in UTC (DATA-003).

### 2.1 Enums

Postgres sorts an enum by its declared order, so the order is the sort order. `issue_status` is declared `backlog`, `in_progress`, `in_review`, `done`, `canceled`, so `ORDER BY status` gives the REQ-017 order (REQ-039). `issue_priority` is declared `urgent` to `none`, so `ORDER BY priority` puts Urgent first and No priority last (REQ-039, REQ-042). `label_color` holds the spec's 8 colours (6.6).

### 2.2 Accounts and sign-in

**`members`**
- Usernames are lowercased before saving (REQ-003.1), so a plain unique index on `username` is enough; emails are unique on `lower(email)`.
- Never deleted (spec section 8), so foreign keys to members keep the default `no action`, which blocks deleting a referenced member.
- **Keeping the last admin (REQ-007.3, REQ-052.3).** `updateMember` first locks every active admin row in id order (`select id from members where role = 'admin' and deactivated_at is null order by id for update`), then the target's row, and the `Member` entity refuses removing admin or deactivating if the target is the only one. Locking the admins before the target means two admins changing each other take the locks in the same order and can't deadlock. The lock serialises two admins demoting each other, so the second sees one admin left and is refused.
- **Role changes apply on the next request (REQ-052).** `requireMember` reads the role from the database on every request; the session caches nothing.

**`invitations`**
- The spec's state is derived, not stored: Accepted if `accepted_at` is set, Revoked if `revoked_at` is set, Bounced if `bounced_at` is set, Expired if `expires_at < now()`, else Pending.
- `provider_message_id` is the latest email's Resend ID, for the bounce webhook (5.4). A resend replaces it and clears `bounced_at`.
- A partial unique index on `lower(email)` where `accepted_at is null and revoked_at is null` allows one open invitation per email. Inviting again replaces that row's `token_hash` and `expires_at`, which is how a resend works (REQ-001.3); the old link's hash no longer matches.

**`password_reset_tokens`**: a successful reset sets `used_at` on that row **and** on all the member's other unused rows (REQ-050.6).

**`sessions`**
- A session ends by deleting its row (4.3); DATA-004's 30 days is a maximum, so that complies.
- Valid while `last_active_at > now() - 30 days` (REQ-006). To avoid a write per request, `last_active_at` is only rewritten when over 1 hour old, losing at most 1 hour of the 30 days.

**`sign_in_attempts`** (failed sign-ins and wrong current passwords, REQ-049.3) and **`password_reset_requests`** have no `id`. SEC-001 counts the last hour's rows, so each is indexed on `(email, created_at)` and `(ip, created_at)`.

**`client_error_reports`** (OPS-008) has no `id`: `username` (null when signed out), the masked `ip` and `created_at`, indexed on `(username, created_at)` and `(ip, created_at)` for the 10-minute count (4.8). The hourly cleanup deletes rows older than 10 minutes.

### 2.3 Projects and labels

**`project_keys`** has one row per key, inserted with the project and **never deleted**, which reserves the key forever (REQ-009.3) while the project row can be hard-deleted with a cascade (DATA-002).

**`projects`**: `description_edited_by` is the member who last saved the description, named in the STD-8 conflict message (you, if you saved from another tab); issues have the same column. `created_by` is the admin who created the project (REQ-046.4), nullable because older projects have no recorded creator.

**`labels`** are unique per project ignoring capitals, on `(project_id, lower(name))` (REQ-021.2).

### 2.4 Issues

- **Numbering (REQ-016).** The create transaction locks the project row (`for update`, the same read that checks it isn't archived), then runs `update projects set next_issue_number = next_issue_number + 1 where id = $1 returning next_issue_number - 1`. The lock makes simultaneous creates wait for each other, so they get different numbers (REQ-016.4). Deletes never decrement the counter, so numbers aren't reused (REQ-016.2).
- **Board position (REQ-026, REQ-027).** `position` is a string sort key from the `fractional-indexing` package, in a `text COLLATE "C"` column, because the keys only sort correctly byte by byte (`Zz` before `a0`); a language collation such as `en_US.UTF-8` would put a card moved to the top at the bottom. A drop between two cards gets a key between theirs; "move to top" gets a key before the column's first card. Only the moved row changes, so members reordering different cards don't conflict (REQ-026.3). Columns sort by `(position, id)`: two simultaneous moves between the same pair may get equal keys, and `id` breaks the tie the same way for everyone.
- **Moving a card.** A move names one neighbour (`place: { after: "WEB-5" }`), not keys. The server computes a key between WEB-5 and whatever follows it *right now*, so a stale board still lands the card next to the chosen one (REQ-026.4). If WEB-5 has left that column, the card goes to the top. A move changes `status` and `status_changed_at` only when the status actually changes. A status change from anywhere else (`PATCH { status }`) also puts the card at the top of its new column (REQ-027.4).
- **`updated_at` (REQ-036).** Set when the title, description, status, priority, the issue's assignees or its labels change; not by reordering within a column (REQ-036.5), comments, or renaming or recoloring a label on the Labels page.
- **`status_changed_at`.** Set on every status change; drives the 14-day Done/Canceled window (REQ-028, REQ-041).
- **`description_version`.** Incremented on each description save. A save sends the version it started from; the transaction locks the row (`for update`) and, if the stored version differs, someone else saved first → the STD-8 conflict message. Other fields don't touch it, so a teammate's status change never blocks your description save. Projects use the same pattern.
- **Labels.** A label change sends the issue's full set (`labelIds`), replacing its `issue_labels` rows. The body schema checks the 10-label maximum (REQ-020.3).
- **Assignees (REQ-019).** `issue_assignees` holds one row per issue and member, with the primary key on `(issue_id, member_id)`, `on delete cascade` from the issue, and an index on `member_id` for My issues and the Assignee filter. There is no maximum. A change sends the issue's full set (`assignees: Username[]`, as for labels), so STD-8's last save wins for the whole set; the transaction diffs it against the stored rows, inserts the added members and deletes the removed ones. Only added members must be active (`422` "Choose an active member" on the `assignees` field); a deactivated member already in the set may stay. The newly added members, minus the actor, go in the `IssueAssigned` event (REQ-043). Responses list assignees sorted by full name. `issues.assignee_id` is gone; its migration copied each value into `issue_assignees`.

**Search (REQ-038).** One condition per typed word, joined with `and`: the word appears in the title, the description or the ID (`key || '-' || number`), each by `ILIKE '%word%'` with `%`, `_` and `\` escaped first (REQ-038.4). GIN `gin_trgm_ops` indexes on `title` and `description` keep this fast at 10,000 issues (NFR-004). drizzle-kit can't declare the `pg_trgm` extension they need, so the first migration runs `create extension if not exists pg_trgm` (added by hand).

### 2.5 Comments and mentions

**`comments`** each belong to exactly one issue or one project (a `num_nonnulls` check).

**`mentions`** record who a text mentions; exactly one of `issue_id` (an issue's description), `project_id` (a project's description) or `comment_id` is set (REQ-044).
- The rows mirror the **current** text: each save parses the mentions (DATA-001), inserts new ones and deletes removed ones. "Mentioned for the first time" (REQ-044) means "not in the text before this save", so a mention removed and later added back emails again, as REQ-044 requires.

### 2.6 Notifications

Four tables keep the *event*, the *what*, the *grouping* and the *how* apart:

**`outbox_events`**: one row per event the outbox writer kept (1.4), written in the action's transaction.

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` primary key | the event's identity; the handler's idempotency key |
| `type` | `text` | the `DomainEvent` type, such as `IssueAssigned` |
| `payload` | `jsonb` | what the handler needs: the actor, the target, the recipients with their notification kind, the comment id if any, and the snapshot below |
| `occurred_at` | `timestamptz` | `now()` when the action committed; starts the REQ-045 wait |
| `published_at` | `timestamptz` null | set when its notifications are recorded; `null` while waiting |
| `attempts` | `integer`, default `0` | failed handler runs |
| `next_attempt_at` | `timestamptz`, default `now()` | when a run may claim it next |

A partial index, `outbox_events_unpublished_idx` on `(next_attempt_at) where published_at is null`, serves the claim and stays small however many events are kept.

**`notification_batches`**: one row per group of notifications a recipient gets together about one issue or project (`target_type`, `target_id`), with its `send_after` (REQ-045). No channel, no state.

**`notifications`**: one row per notification, in its batch, with the `event_id` it came from and a **snapshot** of what any message needs: issue ID, issue title, project name and key, link path, and a plain-text excerpt of up to 500 characters (then "…"). The snapshot is taken by the outbox writer in the action's transaction and copied from the event. `(event_id, recipient_id)` is unique, so recording an event twice adds nothing (1.4).

**`notification_deliveries`**: one row per batch and channel (`channel`, unique per batch), with its `state`, retry count, next attempt and the provider's message ID. Channels come from **`members.notification_channels`** (at least one; `{email}` by default and the only choice in R1) when the batch is created, so a channel change applies from the next batch.

**`notification_deliveries.locked_until`** is the lease a run's delivery pass holds on a claimed delivery (1.4), `null` otherwise. A partial index, `notification_deliveries_pending_idx` on `(batch_id) where state = 'pending'`, serves the claim and the queue counts. The due time comes from the batch (`send_after`), so no single-table index can order by it, but the partial index holds only the few pending rows, each joined to its batch by primary key, and stays small however much history accumulates.

**`notification_deliveries.state_changed_at`**: when the delivery reached its current state, set with `now()` when a run records `sent`, `dropped` or `failed` and when the bounce webhook records `bounced`; `null` while `pending`. The status page counts and lists by it (REQ-053).

**`job_runs`**: one row per periodic job (`name text primary key`, `last_run_at timestamptz not null`). `outbox` is upserted at the start of every run, and read by `/health/worker` and the status page; `cleanup` is claimed once an hour (1.4). It replaces `worker_heartbeats`.

**Channels.** `src/infrastructure/notifications/channels/` has one module per channel; its index maps every `notification_channel` enum value to a sender: `send(recipient, notifications, deliveryId) → Result<{ providerMessageId }, "email-failed">`. The email sender builds the message from the templates (5.3) and calls `sendEmail()` (5.2). Because the map is typed by the enum, a new channel doesn't compile until its sender exists, and nothing in `record-notifications` or `send-due-deliveries` changes.

These lookups and cascades have no index on purpose: `provider_message_id` (here or on `invitations`), `notifications.batch_id`, `notification_batches` by recipient and target, `notification_deliveries.state_changed_at`, `sessions.member_id`, `issue_labels.label_id`, and `mentions` by issue, project or comment (its unique indexes start with `member_id`). At one team's volume they scan small tables; add an index if one shows up in NFR-003 timings.

How the parts fit:

- **No FKs to issues, projects or comments.** Notifications about deleted issues and projects must still be sent (REQ-045.7), so they can't cascade; the snapshot lets the message be built after its target is gone.
- **Recording an event (fixed wait).** `record-notifications` runs once per event, in a run (1.4). For each recipient it looks for a batch for that recipient and target with `send_after > occurred_at` and `send_after > now()` (not yet due, so not yet sent) and attaches to it; otherwise it creates one with `send_after = occurred_at + 2 minutes` and one `pending` delivery per recipient channel. The wait counts from the action, not from the run, so a notification goes out 2 to 3 minutes after it was created: it is due 2 minutes after, and the next run, at most a minute later, sends it (REQ-045). A later notification never moves `send_after` (REQ-045.8) and adds no deliveries. An event whose batch fell due before its run (a failed handler retried later) gets a new batch that's due at once. Two members acting at the very same moment can occasionally cause two messages instead of one; that's accepted rather than adding a lock.
- **Drop checks at send time (REQ-045).** For each delivery, the delivery pass re-checks each of the batch's notifications not yet dropped:
  - recipient deactivated → drop;
  - target issue or project no longer exists → **send** (REQ-045.7);
  - `assigned` but the recipient is no longer one of the issue's assignees → drop;
  - `mentioned` but the comment is gone, or there's no longer a matching `mentions` row → drop.

  A dropped notification stays dropped for every channel. If none is left, the delivery becomes `dropped`. An event still waiting in the outbox is checked the same way once recorded, so a mention edited out before the run is still dropped (REQ-045.3).

  Their data is loaded once per pass for all claimed deliveries, in a fixed number of queries whatever the number of notifications: the recipients; the batches' notifications not yet dropped; the target issues and projects that still exist; and, in one query, the `mentions` rows of those recipients for those targets and for the comments the notifications name. The checks then run in memory. A change made while the pass is sending (a few seconds) isn't seen, the same as a change a moment after the send.
- **Retries (STD-6), per delivery.** After a failed send, `attempts += 1` and `next_attempt_at` moves forward 1, then 4, then 10 minutes; when the third retry fails, the state becomes `failed`. Each retry is sent by the first run after it falls due. A bounce sets `bounced` and isn't retried.

### 2.7 Deleting and cleanup

- **Deleting a project (DATA-002):** cascades to issues, labels, issue_labels, comments (both issue and project comments) and mentions. `project_keys`, outbox events and notifications stay.
- **Deleting an issue:** cascades to issue_labels, comments and mentions.
- **DATA-004 cleanup:** once an hour, the outbox run (1.4) deletes rows older than their retention period, using `now() - interval`, including outbox events published over 30 days ago. These are among the few queries written in raw SQL. Each table is deleted in chunks: one statement deletes at most 1,000 matching rows (`where ctid in (select ctid … limit 1000)`) in its own transaction, and repeats until a statement deletes fewer than 1,000 or the run's time is up. No long transaction holds locks or delays the run's other steps.

## 3. Actions and routes

Settles DEC-002. Pages change data through server actions; route handlers serve only callers that aren't the app's pages (1.2). Input schemas live in `src/app/_server/schemas/<ctx>.ts`, built from the value objects' schemas, so actions and the remaining `/api` routes share them (D-42), and response types in `src/contract/` (3.5); this section fixes names, permissions and errors.

### 3.1 Conventions

- **One action per user action.** Each route's `actions.ts` exports one action per thing a member does there (`createIssue`, `moveIssue`, `updateIssueTitle`, …), each wrapped by the adapter (1.2) and calling one use case. Actions take plain serialisable input (an object, or `FormData` for a form) and return `{ ok: true, data } | { ok: false, error: { kind, message, fields? } }`.
- **Addressing.** Issues by ID (`WEB-42`), projects by key (`WEB`), members by username, all matched ignoring capitals (REQ-016.5). Labels, comments and invitations use their `uuid`.
- **Unknown pages.** Any address that isn't an API-004 page renders Not found (STD-4) through `app/not-found.tsx`.
- **No tokens in addresses but the links' own.** Invitation and reset tokens travel in action input. The `?token=` on the invitation and reset *pages* (API-004) is kept out of logs by 4.8 and 4.9.
- **List paging** uses `offset`; keyset cursors would be complex with several sort columns. With no live updates (spec §3), rows only shift if someone edits mid-scroll, which is accepted.
- **Field-by-field saves.** The issue page saves each field as it changes, with an action that takes only that field, so STD-8's "last save wins" works per field and one failed field leaves the others saved (REQ-020.4).
- **Creating twice.** Issue and comment creates carry `requestId`; a repeat returns the first result instead of a second one (STD-5). `request_id` is unique across the whole table. The repeat is looked up after the target's own checks, so a retry to an issue deleted meanwhile gets `notFound`, and into a project archived meanwhile `forbidden`.
- **Small member data.** A member appears as `{ username, fullName, initials, deactivated }`. An issue's `assignees` is an array of these, sorted by full name, empty when unassigned. A member's email appears only in a full profile: the member's own profile, the admin member list, and the profile an admin's member change or a new member's acceptance returns. An invited email appears in the admin's invitations and the invitation lookup. Password hashes never appear (SEC-008.2).

### 3.2 Errors

Every refusal is `{ kind, message, fields? }`, and the browser shows `message` as-is. That keeps all user-facing copy for server-side outcomes in one place.

Domain and application code throw `DomainError(kind, message, fields?)` from `domain/shared/domain-error.ts`. The action adapter returns its kind and message (D-63); a route handler maps the kind to the status below. No other code names an HTTP status (D-47).

| Kind | Route status | When | Browser shows |
|---|---|---|---|
| `signedOut` | `401` | No valid session: signed out, expired or deactivated (STD-1, REQ-007.4) | Redirect to `/sign-in?next=…` |
| `forbidden` | `403` | Not allowed (STD-2), a cross-site write (SEC-004), or a write to an archived project (REQ-013.4) | Toast (STD-9); STD-2's message in the page area on load |
| `notFound` | `404` | The target doesn't exist, and the message names it. Opening a missing issue gets the Not found page; a write to one gets "This issue was deleted" | Not-found page on load (STD-4); toast on save (STD-9) |
| `conflict` | `409` | Stale save of a description or comment (STD-8) | Message in the editor; text kept |
| `expired` | `410` | An invitation or reset link that's expired, used or revoked (REQ-002.2, REQ-002.4, REQ-050.4) | The page's expired state |
| `invalid` | `422` | Invalid input. With `fields`: one error per field (STD-3). Without `fields`: a form-level refusal, such as the last admin or a wrong sign-in | Next to the fields, or beside the form |
| `limited` | `429` | A SEC-001 limit | Beside the form |
| `unavailable` | `503` | An invitation or reset email couldn't be sent (STD-6) | Toast |
| — | `500` | Anything else: the action rethrows it (1.2) | The DEC-006 toast or error state |

Database rules answer with a field error when one field is at fault: a key, label name or username already taken, or a wrong current password. Inviting an existing or deactivated member is a form-level refusal.

Changing a fixed field (username, email, project key) gets `invalid` with a field error, and the stored value stays (REQ-003.3, REQ-010.1).

A schema failure gets `invalid` "Check the highlighted fields", with the first failing rule's message per field (STD-3); a missing field gets "Required". A rule on the whole input, such as "Change one thing at a time" on a project update, gets `invalid` with its own message and no `fields`. A route body that isn't valid JSON or isn't a JSON object gets `422` "Couldn’t read the request." with no `fields`.

### 3.3 `/api` endpoints (until H20)

The client-rendered screens under `src/app/(signed-in)/[[...path]]` call these until H20 deletes them. As each screen moves to its own page (H13 to H19), its reads become `src/queries` calls and its writes become actions with the same rules, permissions and messages as below; the tables stay the reference for those rules until then.

"Member" means any signed-in active member. Every write to something inside an archived project (its description, issues, comments, labels) gets `403` "This project is archived". Admins can still unarchive or delete an archived project; renaming it gets the same `403`.

The queries declare the contract types (3.5) as their return types. The tables give only what the types can't say.

**Sign-in and account** (no session needed unless noted)

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `POST /api/sessions` | `204`, sets the cookie | Anyone | REQ-047, SEC-001 |
| `DELETE /api/sessions/current` | `204`, with or without a session | Anyone | REQ-006 |
| `POST /api/password-reset-links` | `204` whether or not the email belongs to a member | Anyone | REQ-050, SEC-001 |
| `POST /api/password-reset-lookups` | `204` or `410`; doesn't use up the link | Anyone | REQ-050.5, REQ-050.9 |
| `POST /api/password-resets` | `204`; ends all the member's sessions, then sets a new cookie | Anyone | REQ-050 |
| `POST /api/invitation-lookups` | The invited email, or `410` as for accepting | Anyone | REQ-002 |
| `POST /api/members` | Accepts an invitation: `201` and the new member's profile, sets the cookie. `403` with a session (4.6) | Anyone | REQ-002, REQ-003 |
| `GET /api/me` | The profile, including email and role | Member | REQ-003.3 |
| `PATCH /api/me` | Full name only | Member | REQ-003 |
| `PUT /api/me/password` | `204`; ends the member's other sessions. A wrong current password counts toward the sign-in limit (4.5) | Member | REQ-049, SEC-001 |
| `GET /api/setup` | `{ needed: boolean }`, true while no members exist | Anyone | OPS-001 |
| `POST /api/setup-checks` | Body `{ secret }`. `204` for the right secret; `403` "Wrong setup secret", `410` "Setup already done", `503` when `SETUP_SECRET` isn't set (4.6) | Anyone | OPS-001 |
| `POST /api/setup` | Body `{ secret, email, fullName, username, password }`; same refusals as the check. `201` and the new admin's profile (`Me`), sets the cookie | Anyone | OPS-001, REQ-003, REQ-048 |

**Members and invitations**

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `GET /api/members` | All members, active and deactivated, for the assignee picker (it offers only active ones), the @mention suggestions and the members page; with about 15 people the browser filters the list itself | Member (emails only for admins) | DATA-001, REQ-037 |
| `PATCH /api/members/{username}` | Role or deactivated; returns the full profile | Admin | REQ-007, REQ-008, REQ-052 |
| `GET /api/invitations` | Pending, Bounced and Expired invitations | Admin | REQ-001, REQ-051 |
| `POST /api/invitations` | `201`; works as a resend if the email has an open invitation | Admin | REQ-001 |
| `POST /api/invitations/{id}/resend` | A new link | Admin | REQ-001.3 |
| `DELETE /api/invitations/{id}` | Revokes | Admin | REQ-001.4 |

**Projects and labels**

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `GET /api/projects?archived=false\|true` | The sidebar list, or the Archived list | Member | REQ-013, REQ-015 |
| `POST /api/projects` | `201` | Admin | REQ-009 |
| `GET /api/projects/{KEY}` | Includes the description's version and mentions, the issue count per status (all of the project's issues, zeros included), and when and by whom it was created (`createdBy` is `null` for projects created before the creator was recorded) | Member | REQ-046 |
| `PATCH /api/projects/{KEY}` | Name or archived (Admin), or a description save (Member). A body with both gets `422` "Change one thing at a time" | Per field | REQ-011, REQ-012, REQ-013 |
| `DELETE /api/projects/{KEY}` | The typed-key confirmation is checked in the browser | Admin | REQ-014 |
| `GET /api/projects/{KEY}/labels` | Sorted by name ignoring capitals, each with its issue count | Member | REQ-021, REQ-021.5 |
| `POST /api/projects/{KEY}/labels` | `201` | Member | REQ-020.2, REQ-021 |
| `PATCH /api/labels/{id}` | Name or colour | Member | REQ-021 |
| `DELETE /api/labels/{id}` | | Member | REQ-021.3 |

**Issues and views**

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `GET /api/projects/{KEY}/board` | 5 columns in status order, cards sorted by `(position, id)`. Each card carries all its labels, sorted by name ignoring capitals; the card trims them to 3 and "+N". Done and Canceled hold only issues moved there in the last 14 days | Member | REQ-024, REQ-025, REQ-028 |
| `GET /api/projects/{KEY}/issues` | Filters `status`, `priority`, `assignee` (a username, or `-` for Unassigned; an issue matches if any of its assignees is chosen, and `-` matches an issue with none) and `label` (name, ignoring capitals), each repeatable; `q`; `sort` (default `updated`) and `dir` (default `desc` for `updated`, `asc` otherwise); `offset`. Ties sort most recently updated first, and unknown values are ignored. Up to 100 rows, plus the deactivated members still assigned in the project, for the assignee filter | Member | REQ-036…040 |
| `POST /api/projects/{KEY}/issues` | `201`. `status` is used by the column **+** buttons; a missing or unknown value becomes `backlog`. Optional `assignees: Username[]` (2.4), checked as for a `PATCH` | Member | REQ-016, REQ-029 |
| `GET /api/issues/{ID}` | Includes the description's version and mentions | Member | REQ-016 |
| `PATCH /api/issues/{ID}` | One field per request (3.1): title, status, priority, the full assignee set (`assignees`), the full label set, or a description save | Member | REQ-016…022, REQ-027.4 |
| `PUT /api/issues/{ID}/position` | A status and a place: top, bottom, or after a named card (2.4) | Member | REQ-026, REQ-027, REQ-030 |
| `DELETE /api/issues/{ID}` | | Creator or Admin | REQ-023 |
| `GET /api/my-issues` | Issues in active projects that have the member among their assignees, grouped by status in order with empty groups left out, sorted by priority from Urgent down, then most recently updated. Each row carries all its assignees, as board cards and list rows do. Done and Canceled hold only issues moved there in the last 14 days | Member | REQ-041, REQ-042 |

**Comments**

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `GET /api/issues/{ID}/comments`, `GET /api/projects/{KEY}/comments` | Oldest first, each with its mentions | Member | REQ-032 |
| `POST /api/issues/{ID}/comments`, `POST /api/projects/{KEY}/comments` | `201`; a repeated `requestId` gets `200` and the original (STD-5) | Member | REQ-031 |
| `PATCH /api/comments/{id}` | A stale version gets `409` (STD-8) | Author | REQ-033 |
| `DELETE /api/comments/{id}` | | Author or Admin | REQ-034 |

**Operations**

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `GET /api/notification-stats` | The status page's data. Counts and the recent list go by `state_changed_at`, and all windows use `now()`. A delivery's issue ID or project key comes from its batch's newest notification. A bounced delivery's attempts include the send that bounced. `outboxStaleMinutes` is the whole minutes since the last outbox run once that is 2 minutes or more (OPS-005), worked out with `now()`, else null. No emails and no excerpts | Admin | REQ-053, SEC-007 |

### 3.4 Route handlers

These stay after H20. None of them goes through the action adapter; each checks its own caller.

| Method and path | Notes | Spec |
|---|---|---|
| `POST /api/cron/outbox` | `401` without `Authorization: Bearer {CRON_SECRET}`. One outbox run (1.4) within 50 seconds, then `204` | DEC-004, REQ-045 |
| `POST /api/client-errors` | `204` whether logged or past the limit; the member, if any, comes from the session only (4.8). Same-origin check as 4.4 | OPS-008 |
| `GET /health` | `200` if `select 1` succeeds, otherwise `503` | OPS-005 |
| `GET /health/worker` | No session. `503` if the `outbox` row of `job_runs` is missing or its `last_run_at` is older than `now() - interval '2 minutes'`, if any due pending delivery's `coalesce(next_attempt_at, send_after)` is older than `now() - interval '10 minutes'`, if any unpublished outbox event's `occurred_at` is older than `now() - interval '10 minutes'`, or if the database doesn't answer; otherwise `200`. The path keeps its old name so the deployment's uptime check doesn't change (D-72). The body is a short fixed word, never data about members or notifications | OPS-005 |
| `POST /webhooks/email` | Checks the provider's signature (`401` if it doesn't match). It skips the same-site check, since the provider is always cross-site, and marks emails `bounced` | API-003 |

### 3.5 Shared contract types

Every type a query returns, an action returns or a client component takes as props, and the enum values both sides need, lives in `src/contract/`. It holds types and constant arrays only, so both the browser and the server can import it.
- **Three shapes, two boundaries.** Database rows (`*Row`, inferred from `schema.ts`) stay on the server. Contract types are what reaches the browser, as props or action results. The mapping functions in `src/queries/` (1.8) turn one into the other and declare the contract type as their return type, so a field added to a response by accident fails to compile. A mapper that builds rows with `.map` declares the row type on the callback too, since `.map` infers its element type and would skip the check.
- **Enums have one source.** `issueStatuses`, `issuePriorities`, `labelColors`, `roles` and `notificationChannels` are `as const` arrays in the contract; `schema.ts` builds its `pgEnum`s from them, so their order is still the sort order (2.1). The input schemas and value objects take their picklists from the same arrays (D-42). Client lists keyed by an enum use `satisfies Record<…>`, so a new value fails to compile until every list covers it, and pickers list values in the contract's order, which is also the order the spec names them in (REQ-017, REQ-018).
- **One type per view, derived.** `ListIssue`, `BoardIssue` and `MyIssue` are `Pick`s of `Issue` (`MyIssue` adds the project name), not separate models.

## 4. Auth and security

### 4.1 Passwords (REQ-048, SEC-008)

- **Hashing.** Argon2id via `@node-rs/argon2`, which ships prebuilt binaries, so nothing is compiled on the server.
  - Settings: memory 19 MiB, 2 iterations, parallelism 1 (OWASP's baseline). That takes about 50 ms per hash on a small server.
  - The settings are stored inside each hash. When they change, a successful sign-in re-hashes the password with the new ones.
- **Length rule.** 12 to 128 is counted in Unicode code points (`[...password].length`), not JavaScript string length. Otherwise an emoji would count as 2.
- **No changes to the password.** No trimming and no Unicode normalisation (REQ-048.4): the exact bytes typed are what get hashed.
- **Unknown emails.** Sign-in verifies against a fixed dummy hash when the email isn't an active member, so both cases cost one Argon2id verify. A reset request still takes longer for a member, because only then is an email sent; spec §10 accepts that difference.

### 4.2 Tokens (SEC-003)

- Invitation, reset and session tokens are 32 bytes from `crypto.randomBytes`, base64url-encoded.
- The database stores `sha256(token)` in a `bytea` column, and lookups use that hash. A fast hash is enough because the token itself has 256 random bits; only passwords need Argon2id (SEC-008). The raw token exists only in the email or cookie, and in memory during the request.
- The reset and invitation pages read `?token=` once, then remove it from the address bar with `history.replaceState`. The token is still in the page's memory for the lookup and the submit.

### 4.3 Session cookie (REQ-006, SEC-004)

| Attribute | Value | Why |
|---|---|---|
| Name | `__Host-session` in production, `session` in development | `__Host-` makes the browser refuse the cookie unless it's `Secure`, has `Path=/` and has no `Domain`. Development runs over plain HTTP, where that can't be met. |
| `HttpOnly` | yes | Page scripts can't read it. |
| `Secure` | when `NODE_ENV=production` | SEC-004. |
| `SameSite` | `Lax` | Sent on top-level link clicks from other sites, never on cross-site form posts or background requests. That's exactly what SEC-004 describes. |
| `Max-Age` | 30 days | Renewed whenever `last_active_at` is rewritten (at most hourly, 2.2). |

How sessions start and end:
- **Every sign-in creates a fresh token**, so a session can never be fixed in advance by an attacker.
- **Password change** (REQ-049): delete the member's other sessions and keep the current one.
- **Password reset** (REQ-050): delete all the member's sessions, then create a new one.
- **Deactivation** (REQ-007): delete all the member's sessions.
- **Session check.** `requireMember` loads the session joined with its member, and rejects it if the member is deactivated. A deactivated member's next request gets `401` even if a cleanup missed a row.

### 4.4 Cross-site writes (SEC-004)

**Server actions** rely on Next.js's own check (D-69). An action runs only for a `POST`, and Next.js compares the request's `Origin` with its `Host` (or `X-Forwarded-Host`) and aborts the action when they differ, before any app code runs (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`, "Allowed origins"). The reverse proxy passes the original host (1.1), so `serverActions.allowedOrigins` stays unset. A request with no `Origin` gets through that check, but a browser never sends the `SameSite=Lax` cookie on a cross-site `POST`, so it arrives signed out and only public actions run, which change nothing an attacker could exploit in someone else's name. A test posts to an action with a foreign `Origin` and finds nothing changed (SEC-004.1).

**Route handlers.** For `POST`, `PUT`, `PATCH` and `DELETE`, `/api/client-errors` (and, until H20, the `/api` routes, through `apiRoute`) require:
- an `Origin` header equal to `APP_URL`'s origin;
- or, if `Origin` is missing, `Sec-Fetch-Site: same-origin`.

Anything else gets `403`. `SameSite=Lax` is a second layer of protection. Together they cover SEC-004 with no CSRF token stored in forms or state. `/webhooks/email` is checked by signature instead (5.4), and `/api/cron/outbox` by its bearer secret (1.4).

### 4.5 Sign-in and reset limits (SEC-001)

**Sign-in** (the `signIn` action), in order:
1. Lowercase and trim the email.
2. Count the last hour's `sign_in_attempts` rows for that email and that IP; at 10 or more for the email, or 30 or more for the IP, answer `429`. This comes **before** the password check, so a correct password is refused too (SEC-001.1).
3. Look up an active member by `lower(email)` and verify the password.
4. If either fails, insert a `sign_in_attempts` row and answer `422` "Incorrect email or password.", not `401`, which the browser would treat as an ended session. Unknown and deactivated emails count the same way (SEC-001.3).
5. On success, create the session. Earlier failures stay counted until an hour old; success doesn't reset them.

**Changing a password** (`changePassword`) shares the limits: a wrong current password inserts a `sign_in_attempts` row for the email and IP, and past either limit even the right one gets `429` (REQ-049.3).

**Reset request** (`requestPasswordReset`): the same count against `password_reset_requests` (5 per email, 20 per IP), but **every** request is recorded, not just failures. The email goes only to an active member's address.

**Details:**
- **IP address.** The rightmost `X-Forwarded-For` entry, set by the reverse proxy (1.1); `127.0.0.1` in development without a proxy.
- **Races.** Simultaneous requests can both pass the count, exceeding a limit by one; accepted rather than adding a lock.

### 4.6 Invitation and reset links

Accepting an invitation (`acceptInvitation`) and resetting a password (`resetPassword`) each run in one transaction that **locks the link's row** (`for update`) before checking it, so two submits of the same link can't both succeed. The input schema has already checked the form (D-42), so a malformed form is refused before the link is looked at.
- **Which `410`.** A revoked invitation gets REQ-002.4's message; expired, accepted or unknown (including a link replaced by a resend) gets REQ-002.2's. A reset link that's used, expired or unknown, or whose member is deactivated, gets "This link has expired".
- **Signed in.** Accepting with a valid session gets `403` "You're signed in as {name}. Sign out to accept this invitation." The page shows that state before the form appears (REQ-002.3); the API check only stops a bypass. The reset page shows its own sign-out prompt and never looks at the token (REQ-050.8).

**Opening a link.** The invitation page looks its token up as it renders (`lookUpInvitation`), so it can show "expired" straight away (REQ-002.2) and greet the person by email. The reset page checks its token the same way (`checkPasswordReset`), and shows the form only for a usable link (REQ-050.9). The token reaches the page as `searchParams`, and the page's client component removes it from the address bar with `history.replaceState` (4.2). Neither lookup uses up the link, so a mail scanner opening it changes nothing (REQ-050.5).

**First-admin setup (OPS-001).** `checkSetupSecret` and `createFirstAdmin` are use cases in `src/application/identity/`, and `setupNeeded` is a read in `src/queries/members.ts`. They are public like accepting an invitation, so they take no `actor`.
- **Secret check:** a member exists → `410`; `SETUP_SECRET` unset → `503`; otherwise the sha256 of the given and configured secrets are compared with `crypto.timingSafeEqual`, and a mismatch gets `403`.
- **Creating the admin:** `createFirstAdmin` runs the same check, then in one transaction takes `lock table members in exclusive mode`, re-checks that no member exists (OPS-001.7), adds the admin (`Member.create`) and starts its session. It returns `{ username, sessionToken }`; the caller reads the profile through `memberProfile` in `src/queries/members.ts`.
- **No guess limit (D-54):** a secret of at least 32 characters can't be guessed, and the endpoints stop working once the admin exists.

### 4.7 Markdown (SEC-002, DATA-001)

One module, `src/lib/markdown/`, used for both **rendering** in the browser and **finding mentions** on the server. Because both use the same parser, `@sam` inside code is skipped the same way in both places (DATA-001.4).

- **Parser:** `remark-gfm` (checklists, tables, strikethrough) on `remark-parse`. `parse.ts` exports the remark plugins; the browser renders with `react-markdown` using them. On the server, `findMentions` runs the same plugins through `unified`, and `toPlainText` (for excerpts) joins the text of each block. `rehype-raw` is never used.
- **Raw HTML.** A small remark plugin turns every `html` node into a `text` node. `<script>` and `<img onerror>` then show as literal text (REQ-012.3, SEC-002.1), rather than depending on a library default.
- **Links.** A `urlTransform` allows only absolute `http:`, `https:` and `mailto:` URLs, for links and images. Any other link, relative ones included, renders as its plain text, not an `<a>` (SEC-002.2). Allowed links get `target="_blank" rel="noopener noreferrer"`.
- **Mentions.** A remark plugin walks text nodes (code has none, so it's skipped) and matches `(?<![A-Za-z0-9._%+@-])@([a-z0-9-]{2,20})(?![a-z0-9-])`. The look-behind skips email addresses and `foo@sam`; the look-ahead stops at punctuation, so `(@sam)` and `@sam, thanks` both match (DATA-001.5, DATA-001.6). Mentions are found in issue descriptions, project descriptions and comments.
  - On the server, the matches become the `mentions` rows: active members only (2.5).
  - In the browser, a match is shown highlighted, with the full name on hover, only if the username is in the `mentions` list the API returns with the text, so the browser never looks members up itself. Mentions aren't links (DATA-001).

### 4.8 Error logging (SEC-007, OPS-007, OPS-008)

Built by the E batch (E02–E08); batch H moves the catch points to the action adapter and the outbox run. `Result` (`ok`, `err` in `domain/shared/result.ts`) is used only by `sendEmail`.

**The boundary rule.** An error is logged once, by the code that turns it into an answer: a status code, a retry, an exit code, a crash screen. Code below that boundary throws or returns and never logs. A `DomainError` is an expected outcome, not a fault: the action adapter returns it and `apiRoute` maps it to its status, and neither logs an error line (D-47).

**Catch points.** These are the only places that log an error:

| Where | Catches | Logs |
|---|---|---|
| `onRequestError` in `src/instrumentation.ts` | Errors Next.js sees: a page or layout render, an action's rethrown error (1.2), the route handlers | `route/request-failed` |
| `apiRoute`'s catch, until H20 | Anything but a `DomainError` thrown by an `/api` handler; answers `500` | `route/request-failed` |
| The outbox run's per-event `try` (1.4 step 2) | One event's handler error; the event backs off | `outbox/event-failed` |
| The outbox run's per-delivery `try` (1.4 step 3) | One delivery's unexpected error; counts as a failed attempt. A failed send (`err` from the sender) also counts as one but logs nothing here, since `sendEmail` logged it | `outbox/delivery-failed` |
| The outbox run's outer, metrics and cleanup catches | Heartbeat, claims, drop-check loading; metrics; cleanup. The outer catch answers `500` | `outbox/run-failed`, `metrics-failed`, `cleanup-failed` |
| The top-level `catch` of each script in `scripts/` | A script that can't start or finish; exits `1`. A script's own usage message (a missing `DATABASE_URL`) is CLI output, not an error line | `boot/start-failed` |
| `sendEmail` (`shared/email/send.ts`), the one outbound wrapper | A failed call to Resend or Mailpit: a thrown `fetch` or the 10-second timeout, a non-2xx status (the error is named after Resend's error `name`), or a 2xx without the message id; returns `err("email-failed")`, never throws. Invitations and password resets turn it into `DomainError("unavailable")` (`503`), so the transaction rolls back (1.5); the outbox run records a failed attempt | `mail/fetch-failed`, `bad-status`, `bad-response` |
| `POST /api/client-errors` | A report from the browser's catch points: `window` `error` and `unhandledrejection`, `error.tsx` and `global-error.tsx`, each region's error boundary (STD-11) | `client/uncaught`, `page-crashed`, `zone-crashed` |

There's no database pool listener: postgres.js reconnects on its own and emits no pool `error` event, and a failed query reaches one of the catch points above (D-52).

**The line.** One writer, `logError(source, event, error, context?)` in `infrastructure/log.ts`, writes one JSON line to standard error. The info lines (the request and action lines, email events, outbox metrics) go through the same writer, as `logInfo(source, event, context)`, with `level: "info"` and no `error`. Biome's `suspicious/noConsole` rule allows `console` only in `infrastructure/log.ts` and `scripts/` (CLI output), so nothing else writes a line. Tests read error lines with `spyOnLoggedErrors()` from `src/test/log.ts`. Keys come in this order:

| Key | Value |
|---|---|
| `level` | `"error"` or `"info"` |
| `time` | ISO 8601, from the app clock (a log time isn't an expiry check, 1.3) |
| `source` | Where: `route`, `action`, `outbox`, `boot`, `mail`, `client` |
| `event` | What failed, from the table below |
| context | The event's fields from the table below, in that order; nothing else |
| `error` | `{ name, message, code?, stack?, cause? }`, copied field by field: `message` cut at 500 characters, `code` only if a string or number, `cause` the same shape, 2 levels deep. A thrown non-object becomes `{ name: "Error", message: String(value) }`. Email addresses in `message` and `stack` become `[email]`. A `DrizzleQueryError`'s message (which holds the SQL and its parameters) is replaced by `"query failed"`, keeping its PostgreSQL cause's `code` (SQLSTATE) |

**Sources and events.** `source`, `event` and the context type are closed unions in `infrastructure/log.ts`, holding every row below.

| `source` | `event` | Level | Context |
|---|---|---|---|
| `route` | `request` | info | `method`, `path`, `status`, `durationMs`, `actor?` (one per `apiRoute` request, until H20) |
| `action` | `call` | info | `action` (its name), `outcome` (`ok`, the `DomainError`'s kind, or `error` for a rethrown one), `durationMs`, `actor?` (one per action call, 1.2) |
| `route` | `request-failed` | error | `method`, `path` (from `apiRoute`) or `route` (the pattern, from `onRequestError`), `actor?`, `digest?` |
| `outbox` | `metrics` | info | `events`, `pending`, `due`, `oldestDueSeconds`, `sent`, `failed`, `dropped` (1.4 step 5) |
| `outbox` | `event-failed` | error | `eventId`, `type` |
| `outbox` | `delivery-failed` | error | `deliveryId`, `channel` |
| `outbox` | `run-failed`, `metrics-failed`, `cleanup-failed` | error | none |
| `boot` | `start-failed` | error | `script` (such as `migrate`, `seed`) |
| `mail` | `bounced`, `ignored` | info | `kind?` (`notification`, `invitation`, `untracked`), `id?` (5.4) |
| `mail` | `fetch-failed` | error | `host` |
| `mail` | `bad-status` | error | `host`, `status` |
| `mail` | `bad-response` | error | `host`, `fields` (the failing field paths only, never their values) |
| `client` | `uncaught`, `page-crashed`, `zone-crashed` | error | `actor?`, `ip`, `browser`, `device`, `userAgent`, `page`, `build?`, `component?`, `digest?`, `timeZone?`, `occurredAt` |

**Never logged** (SEC-007): passwords, tokens and links that carry them; request and response bodies, headers and cookies; query strings; email addresses and recipients; description, comment and email text; SQL and query parameters; full IP addresses; an error's own properties beyond the whitelisted fields; the email API key or Resend's URLs. `actor` is a username, never an email.

**Client reports (OPS-008).**

1. **Catch.** `window` `error` and `unhandledrejection` report `uncaught`. `src/app/error.tsx` and `src/app/global-error.tsx` render the crash screen (STD-10), which reports `page-crashed` once on mount with Next's `digest` if there is one, so a crash on the server and in the browser can be matched (STD-10.5); `global-error.tsx` calls the reporter directly because it sits outside the app's providers, and imports the kit stylesheet itself because it replaces the root layout. A crash in any page that no `Region` catches reaches `error.tsx`. The crash screen keeps the tab's crash times in `sessionStorage` (`tracklite.crashes`); if storage is unavailable each crash counts as the first. Each region's error boundary reports `zone-crashed` with the first component name of React's `componentStack` (STD-11).
2. **Send.** `createErrorReporter` in `src/lib/` is the only code that names `/api/client-errors`. It cuts each string to the server's cap, de-dupes by message and first stack frame, sends at most 20 an hour (both reset hourly), queues while `navigator.onLine` is false and flushes on `online`, posts with `keepalive: true` so a report survives a reload, and drops a failed send. It never throws. `occurredAt` is taken when the error is caught. `build` is the build ID baked into the bundle: `next.config.ts` sets `env.BUILD_ID` to the `BUILD_ID` environment variable, or else the short git commit at build time (`unknown` without git). A client component in the root layout creates one reporter, installs the `window` listeners and provides it through `ErrorReporterContext`, whose default is a no-op. A guard test fails if any other file under `src` (outside the endpoint's own route folder) names `/api/client-errors`. `productionBrowserSourceMaps` is on, since the repository is public, so a reported `stack` can be mapped back to source.
3. **Accept.** The route checks the origin (4.4) and parses a Valibot schema that caps every string: `event` one of the three client events, `name` 100, `message` 500, `stack` 4,000, `page` 200 and starting with `/` (the browser sends `location.pathname`), `component` 200, `digest` 100, `build` 100, `timeZone` 64, `occurredAt` an ISO time. `event`, `name`, `message`, `page` and `occurredAt` are required, the rest optional; unknown fields are dropped. Fields added later are optional, so an old tab's report still parses.
4. **Log.** The use case, `reportClientError` in `application/identity/report-client-error.ts`, takes `actor` from the session only, if there is one (OPS-008.2). It masks the IP from `clientIp` (IPv4 last octet → `0`; IPv6 keeps the first 3 groups, `2001:db8:85a3::`; a v4-mapped IPv6 address is masked as IPv4), parses the `User-Agent` header into `browser` and `device` (`desktop`, `mobile`, `tablet`) and cuts it to 300 characters as `userAgent`, then writes one `client` line. Nothing is stored except the limit's attempt row.
5. **Limit.** At most 30 reports in 10 minutes per member, or per masked IP when signed out, counted in a `client_error_reports` table like `sign_in_attempts` (4.5), with `now()` in SQL and the same hourly cleanup (2.2). A limited report inserts no row. Logged or limited, the answer is `204`, so the browser can't tell and has nothing to retry.

**Reading the logs.** Lines are on the process's standard error, mixed with Next.js's own output; `fromjson?` skips lines that aren't JSON. Where the deployment keeps the logs is outside this repository; these read from standard input.

```bash
jq -cR 'fromjson? | select(.level == "error")'                                   # one line per error
tail -F web.log | jq -cR 'fromjson? | select(.level == "error")'      # follow live
jq -cR 'fromjson? | select(.source == "outbox")'                                  # one source
jq -sR '[split("\n")[] | fromjson? | select(.level == "error")] | group_by([.source, .event]) | map({source: .[0].source, event: .[0].event, count: length})'   # count by source and event
jq -cR 'fromjson? | select(.level == "error" and .actor == "sam")'                # one member's errors
jq -cR 'fromjson? | select(.source == "client") | {time, event, page, build, component, message: .error.message}'   # client errors
```

### 4.9 Response headers

The reverse proxy (1.1) adds these to every response:
- `Strict-Transport-Security: max-age=31536000` (SEC-005)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`, so no referrer goes to other sites (SEC-010) and a page address containing a token never reaches another site or an access log through the `Referer` header (SEC-007). `src/proxy.ts` sets it too on page requests, so pages keep it even without the proxy.

**Content Security Policy (SEC-010).** Next.js puts small inline scripts in every page, so the policy needs a fresh nonce per request. `src/proxy.ts` generates it and sets, on page requests only:

```
default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

In development `script-src` also gets `'unsafe-eval'`, which Next.js's dev tooling needs. Next.js reads the nonce from the request and adds it to its own scripts; the root layout awaits `connection()` so every page is rendered per request. Pages render per request anyway, since they read the session cookie and current data (1.7), so the nonce costs no caching.

**Access logs (SEC-007).** The reverse proxy's access log drops the `token` query parameter, so `/invite` and `/reset-password` addresses are logged without it.

### 4.10 Permissions (SEC-006, STD-2)

The adapter or page says who you are; the use case or query says what you may do (D-43). SEC-006's single server-side permission layer is the application layer and the queries, so a use case file shows who may call it.

- **Adapters only authenticate.** The action adapter's access mode, like `apiRoute`'s, is `"public"` or `"member"`; for `"member"`, `actionMember` (`signedOut`) loads the member and passes it on. The `(signed-in)` layout does the same for pages. No page, action or route checks a role.
- **`actor` first.** Every use case and query called for a signed-in member takes the member as its first parameter, `actor`, even reads that don't use it yet (`_actor`). Public flows (sign-in, password reset, invitation lookup and acceptance, the email webhook), the outbox run, cleanup and helpers (log, tokens, email, limits) take none.
- **Admin checks.** `domain/identity/actor.ts` defines `type Actor = { id, role }`, what a use case needs to know about who is asking, and `assertAdmin(actor)`, which narrows the actor's `role` to `"admin"` and otherwise throws a `forbidden` `DomainError` "You don't have permission to do that." (STD-2). It accepts any value with a `role`, so the session's member row passes as an actor.
  - Admin-only use cases and queries call `assertAdmin(actor)` first: `createProject`, `deleteProject`, `updateMember`, `listInvitations`, `createInvitation`, `resendInvitation`, `revokeInvitation` and `notificationStats`.
  - Mixed functions check on the admin-only branch: `updateProject` for `name` and `archived`. `listMembers` never throws; it shapes the response by role (emails only for admins).
  - Ownership checks run once the row is loaded: `deleteIssue` (creator or admin), `editComment` (author only), `deleteComment` (author or admin). The check itself is an entity method (1.8).
- **Order of checks:** cross-site (4.4), session (`signedOut`), input schema (`invalid`), the use case's role check (`forbidden`), lookups (`notFound`) and ownership (`forbidden`), database rules, then the write. The role check precedes any lookup, so a member gets `forbidden`, not `notFound`, for an admin-only action on a missing target and learns nothing about it. A member's invalid input to an admin-only action gets `invalid`, not `forbidden` (D-42).
- **Tests are the guard.** Typecheck can't force an admin-only use case to call `assertAdmin`, so each has a `forbidden` test calling it directly with a plain member.
- **Logging.** Use cases don't log, except the client-report one, whose job is to write the line (4.8); the adapter names the actor by username (4.8), which SEC-007 allows (SEC-007.1 itself logs "member sam").

## 5. Notifications and email

### 5.1 Provider: Resend (DEC-003)

| DEC-003 requirement | Resend |
|---|---|
| HTTP API | `POST https://api.resend.com/emails`, called with plain `fetch`, with no SDK. |
| Bounce webhooks, signed (API-003) | `email.bounced` events, signed with Svix-style HMAC headers (5.4). |
| Fits NFR-009 (< $20/month in total) | The free plan, 3,000 emails/month and 100/day at the time of writing; check on sign-up. That leaves plenty of headroom for hosting. |
| Team domain with SPF and DKIM | Verified sending domain (5.5). |
| API key only in server config | `RESEND_API_KEY` in server config (1.6, OPS-006). |

Also useful: Resend accepts an `Idempotency-Key` header, which closes the duplicate-on-crash gap in 1.4.

**Risk: the 100/day cap.** A team of under 15 with 2-minute combining should stay well below it, but a very busy day could hit it. Sends over the cap fail and are retried like any other failure, so a notification can end up `failed`, and an invitation or reset shows STD-6's "We couldn’t send the email". If that ever happens, the fix is a paid plan or Amazon SES. The `sendEmail()` module (5.2) is the only code that would change.

### 5.2 Sending

`sendEmail({ to, subject, text, idempotencyKey? })` picks its backend by `NODE_ENV`:
- **production:** Resend's HTTP API (5.1);
- **development** (any other `NODE_ENV`): Mailpit's send API (`/api/v1/send` on `MAILPIT_HOST`:`MAILPIT_PORT`, 1.6), so every email shows in Mailpit's inbox with no Resend key;
- **tests:** an in-memory outbox that tests can inspect, and make fail on demand (REQ-001.7, REQ-050 with the service down, the STD-6 retries).

It returns `Result<{ providerMessageId }, "email-failed">` and never throws; a failed Resend or Mailpit call logs its own `mail/*` line first (4.8). A failing outbox returns `err` without a line.

- **Plain text only.** No HTML templates. REQ-044 already asks for the excerpt "as plain text", text emails deliver well, and it's one template per email instead of two.
- **From:** `EMAIL_FROM`, a bare address such as `notify@mail.example.com`.
- **Timeout:** 10 seconds (`AbortSignal.timeout`).
- **How results are treated:**
  - any `2xx` is a success, and the response's `id` is stored as `provider_message_id`;
  - anything else, a network error or a timeout is a failure;
  - for notifications, a failure is retried as in 2.6; for invitations and resets, a failure is `503` (1.5).
- **Logging:** a non-`2xx` answer from Resend logs its HTTP status and error *name* only, never the recipient or text (SEC-007).

### 5.3 Email content

The wording of every email the app sends is in the spec (§9, "Email content"). That's where to change it. How the code builds each email:

- **Templates.** One plain function per email type in `src/infrastructure/email/templates.ts`. Each takes the snapshot (2.6) or the token and returns `{ subject, text }`. Tests check each one against the spec's wording.
- **Excerpts** are made with the shared Markdown module's text extraction (4.7), when the notification is created.
- **Comment links** end in `#comment-{id}`. The browser scrolls to that comment (section 6).

### 5.4 Bounce webhook (API-003)

`POST /webhooks/email`:
1. Read the **raw** body with `request.text()`, since the signature covers the exact bytes.
2. **Verify the signature** using `svix-id`, `svix-timestamp` and `svix-signature`:
   - compute HMAC-SHA256 of `{id}.{timestamp}.{body}` with the base64 secret from `RESEND_WEBHOOK_SECRET` (the part after `whsec_`);
   - accept if it matches any `v1,` signature in the header (constant-time compare) and the timestamp is within 5 minutes; otherwise `401`.

   About 20 lines of `node:crypto`, with no `svix` dependency; tests sign with a known secret.
3. Handle the event:
   - `email.bounced` → look up `provider_message_id`:
     - in `notification_deliveries` (channel `email`): set `bounced`, log `mail/bounced` with `kind: "notification"` and the delivery's `id` (REQ-045.6);
     - in `invitations`: set `bounced_at` so the members page shows Bounced (REQ-051), log `mail/bounced` with `kind: "invitation"` and its `id`;
     - in neither (a reset email): log `mail/bounced` with `kind: "untracked"`.
   - any other event type → ignore.
   - a body that isn't JSON or an object, or an `email.bounced` without `data.email_id` → ignore and log `mail/ignored`, without the body.
4. Answer `200` whenever the signature is valid, even for ignored events, or Resend keeps retrying.

### 5.5 Domain setup (one-time, before launch)

Mail is sent from a subdomain, so the app's sending reputation is kept apart from the team's normal email. The SPF, DKIM and DMARC records and the webhook registration are part of the deployment, outside this repository.

## 6. Screens

Behaviour and copy come from the spec; this section only adds the routes, layout and pages the spec doesn't describe. All components come from the Track Lite design system (`src/components/ui/track-lite/`). Complex widgets use React Aria Components; the kit's `Dialog` also takes `FocusScope` from the lower-level `react-aria` hooks package.

Every R1 screen is designed in the Claude Design export "Tracklite project setup" (2026-10-25, on the Docket design system), kept in `docs/design/`: `Tracklite prototype.dc.html` (one `pg.*` block per screen), `Tracklite states.dc.html` (states you can't reach by clicking), one `Page - <screen>.dc.html` frame per screen, and `tracklite-app.css` (Tracklite markup on Docket tokens). `docs/design/implementation-plan.md` records the design-versus-spec decisions (C1–C21). A change to a screen starts from the export.

### 6.1 Routes

The pages are API-004's addresses, one `page.tsx` each under `src/app/(signed-out)/` or `src/app/(signed-in)/` (1.7). `/project/[key]/layout.tsx` resolves the project once for the board, list, details, labels and settings pages, and `/issue/[id]/page.tsx` the issue.
- `/forgot-password` sends a signed-in member to `/my-issues`, as `/sign-in` and `/` do (1.7).
- `/reset-password` and `/invite` show a signed-in member a sign-out prompt (REQ-050.8, REQ-002.3).
- `/welcome` is reached only while setup is needed, and goes to `/sign-in` otherwise (1.7, OPS-001). The welcome screen has no design export yet, so it's built from the signed-out kit pieces that `/invite` uses: the secret step (the server's refusal shown under the field), then email and the same profile and password fields, plus **Confirm password**, which the browser checks before sending ("Passwords don’t match").
- `/project/{KEY}/settings`, `/settings/members` and `/settings/notifications` are admin-only.
- Any other address shows Not found (STD-4).

**Permissions.**
- A member who reaches an admin-only page sees "You don't have permission to do that." (STD-2) in the page area; the links to it are hidden.
- An unknown project key or issue ID shows Not found (STD-4): the layout or page calls `notFound()`, which renders `not-found.tsx` with a `404`.

**Addresses.**
- When an address uses lower case, such as `/issue/web-42`, the page redirects to the canonical form `/issue/WEB-42` with `redirect()` (REQ-016.5). Project addresses work the same way in the project layout: `/project/web/list?status=done` becomes `/project/WEB/list?status=done`, keeping the rest of the path and the query string; the browser keeps the hash.
- An address ending in `#comment-{id}` scrolls to that comment once comments load, and highlights it briefly. If the comment is gone, the page stays at the top.

### 6.2 App shell

Every signed-in screen sits in the same shell.

**Sidebar**, top to bottom:
- **My issues**.
- **Projects:** the active projects, as "Name · KEY", sorted as in REQ-015. Admins also get a **+** that opens the New project dialog (name and key).
- **Archived projects**.
- **Members** (admins only).
- **Notifications** (admins only), the status page (REQ-053).
- At the bottom, the member's initials and name, opening a menu with **Profile** and **Sign out**.

**Project header**, shown on the board, list, details and labels screens:
- "Name · KEY", with a details link next to it (REQ-046).
- Tabs: **Board | List**, and a **Labels** link.
- A settings gear (admins only).
- **New issue**, hidden when the project is archived.

An archived project's header shows an "Archived" badge, and no create or edit controls appear anywhere inside it (REQ-013).

### 6.3 Pages the spec doesn't describe

The spec gives the copy for these pages; these are the layout choices it leaves open.

- **Reset password:** the expired state has a **Request a new link** link that goes to `/forgot-password` (REQ-050.4).
- **Accept invitation:** the invited email is shown, not editable. The expired and revoked states show no form (REQ-002).
- **Profile:** full name with **Save**; username and email read-only; a separate **Change password** form.
- **Members** (admin): the invite field, the invitations table, then the members table sorted by name. Invitation rows have **Resend** and **Revoke** buttons; member row actions are in a **⋯** menu (REQ-051). Revoke and Deactivate ask for confirmation.
- **Notification status** (admin, REQ-053): the title with **Refresh** beside it, then four sections. **Outbox**: the last run as a relative time (6.7), or "Never". **Queue**: pending, due and the oldest due wait. **Last 24 hours**: one row per channel, columns Sent, Dropped, Failed and Bounced. **Recent problems**: Recipient (username), Channel, Issue or project, Attempts and When (6.7), or "No failed or bounced notifications.". **Refresh** calls `router.refresh()` inside a transition and is disabled while it runs; the page reads current data when it renders and is never polled (1.7).
- **Project settings** (admin): name with **Save**, the key read-only, **Archive** / **Unarchive**, and **Delete** in a dialog whose button stays disabled until the key is typed exactly (REQ-014).
- **Archived projects:** each one opens its board, read-only.
- **List and My issues rows:** up to 2 labels, then "+N" (a board card shows 3, REQ-025).
- **New issue:** a dialog with a title and an **Assignees** button (the same multi-select as the issue page, sent with the create; REQ-016.6), opened from **New issue** or a column's **+** (REQ-029). On success it goes to the new issue's page (D-37).

### 6.4 Issue page

- **Header:** a link back to the project, the issue ID, and the title. The title is edited in place and saved on Enter or when focus leaves it. Escape cancels.
- **Main column:**
  - the description, shown formatted, with an **Edit** button that switches to a Markdown text area with **Save** and **Cancel** (STD-8 conflicts appear here);
  - the comments below it (REQ-032), then the comment box.
- **Side panel:** Status, Priority, Assignees and Labels pickers (Assignees is a multi-select listing active members, filtered by name or username, where Enter adds the first match and each toggle saves the whole set; deactivated assignees are shown but not offered), each saving as soon as a value is chosen. A picker shows the new value once the server accepts it; on a failure it keeps the old value. Then "Created by {name}, {date}", and **Delete issue** for the creator or an admin. After a delete, the app goes to the project's board.
- **Mention suggestions (DATA-001):** typing `@` in the description editor or comment box opens a list of active members, filtered by username or name as the member types. Choosing one inserts `@username`.
- **Unsaved text (REQ-035):** a comment box holding text, or a description editor (issue or project) with unsaved changes, asks before in-app links with `useLeaveGuard` and its REQ-035 message, and before closing or reloading the tab with `beforeunload` (1.7).

### 6.5 Board details

- **Drag and drop:** React Aria Components' `GridList` with `useDragAndDrop`, one list per column, which allows reordering within a column and dropping into another. It comes with keyboard and screen-reader support for free, on top of the **⋯** menu that REQ-030 requires. The M5.1 spike confirmed it, including automatic scrolling near a column's edges (REQ-024); D-40 lists what the board must do to get there.
- **Each column scrolls on its own** (REQ-024.3), with the header and counts fixed.

### 6.6 Label colours

The spec's eight colours (REQ-021): `gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`. Each maps to a Track Lite colour token pair (background and text) that meets WCAG AA contrast (NFR-007). The tokens don't yet cover all eight hues, so until the kit adds the eight pairs, the Labels page draws every label as the neutral label pill with its colour name beside it. The name stays as a non-colour cue once the tokens exist. Labels created from the picker are `gray` (REQ-020). Deleting a label asks for confirmation, naming how many issues have it (REQ-021.5).

### 6.7 Times

- **Relative times** (REQ-031): "just now" under a minute, then "5 min ago", then "3 hours ago", "2 days ago" from `Intl.RelativeTimeFormat`, up to 7 days.
- **Older dates** show as "Sep 20", or "Sep 20, 2025" when the year isn't the current one.
- **Exact time on hover:** the full date and time in the browser's time zone (DATA-003).

## 7. Decisions

Only decisions with an alternative worth recording. Where the reason is already given next to the design it shapes, the row was removed; the gaps in the numbering are those rows, and numbers are never reused.

| # | Decision | Over | Because |
|---|---|---|---|
| D-1 | Drizzle ORM on the postgres.js driver (spec 0.9) | postgres.js queries alone | Matches the existing setup; typed schema and migrations. |
| D-5 | `pg_trgm` + `ILIKE` per word | Postgres full-text search | The spec asks for substring matching (`"42"` → `WEB-42`, `"100%"`), which full-text search doesn't do. |
| D-9 | **Reversed by D-70 (2026-11-05).** Was: a separate worker process polling PostgreSQL with `skip locked` (DEC-004) | | The owner chose an outbox drained by a cron route, with no second process. |
| D-10 | **Reversed (2026-11-05, owner decision).** Pages are React Server Components that read their data on the server through `src/queries`, and changes go through server actions (1.7). Was: one HTML shell for every address, with all page data loaded in the browser through the API | One HTML shell with browser-side routing and a client data store | Following the owner's DDD part 8 article: less client code and state, one render per request with current data, and permissions still in one layer, since pages, actions and routes all call the same use cases and queries (SEC-006). |
| D-26 | Nonce-based CSP set in `src/proxy.ts` (SEC-010) | A CSP without script rules | SEC-010 requires that only the app's own scripts run, and Next.js's inline scripts need a nonce for that. |
| D-27 | **Reversed (2026-11-05).** The App Router's file-system routes, `next/link` and `useRouter` handle navigation. Was: a client router library inside the shell, chosen for its navigation blocker | Keeping a client router beside the App Router | Server-rendered pages make the App Router the only router; REQ-035's prompt moves to a link guard (D-67). |
| D-32 | Resend (DEC-003) | Postmark, Amazon SES | Free plan fits NFR-009, signed webhooks, idempotency keys, simple domain setup. Postmark's paid plan (~$15) plus hosting goes over the $20 budget, and its webhooks aren't signed. SES is cheapest at volume, but its bounces come through SNS, which needs an AWS account and much more setup for 15 people. |
| D-34 | `fetch` + hand-written signature check | Resend SDK, `svix` package | Two small functions instead of two dependencies. |
| D-36 | React Aria `GridList` drag and drop | dnd-kit | Already in the stack, and accessible by keyboard and screen reader out of the box. Edge auto-scroll confirmed by the M5.1 spike (D-40). |
| D-37 | New issue: a title and assignees, then go to the issue | A full create form | Matches REQ-016's flow ("enters a title", with assignees chosen in New issue); everything else is edited on the issue page. |
| D-39 | Track Lite design system, ported from its Claude Design project into `src/components/ui/track-lite/` | Hairline; a component library from npm | Made for this product. Fonts load through `next/font` and icons through `lucide-react` (C20) instead of the project's CDN links, which the CSP (D-26) would block. |
| D-40 | Keep D-36 with no fallback, after the M5.1 spike. Each column's `GridList` is the scroll box, with `position: relative` (virtualized with `Virtualizer` and `ListLayout` since M11.2b, so only the cards in view render); each card has a `<Button slot="drag">` | Writing our own edge auto-scroll; a separate drag library | Mouse drags across 5 columns, into an empty column (`onRootDrop`) and within a column (`onReorder`) all landed correctly. Near a column's edge the browser scrolls it natively (React Aria's `useAutoScroll` in Safari). Keyboard drags (Enter on the drag button, Tab between columns, arrows, Enter) work and are announced. Without `position: relative` on the scroll box, hidden keyboard drop targets scroll the page instead of the column; without the drag button, cards that open on click drag only with Alt+Enter. |
| D-42 | Valibot input schemas, declared per action (or `/api` route) and run by the adapter; they live in `src/app/_server/schemas/<ctx>.ts`, built from the value objects' schemas, and the use case takes their typed output | Hand-written `typeof` checks in each use case; Zod; parsing at the start of each use case; each schema in the domain module that uses it | One path turns invalid input into STD-3's `invalid` refusal, use cases get typed, trimmed input instead of `unknown`, and a malformed body stops being a `500`. Check order is in 4.10: a signed-out caller always gets `signedOut` and learns nothing about the input; invalid input fails before the role check and any query, so a member without the role sending invalid input gets `invalid`, not `forbidden`, revealing only the input's shape, which the browser code already shows. Lengths count code points, as the spec and Postgres do, not UTF-16 units. One schemas file per context keeps its input rules in one place to review, apart from its database code. |
| D-43 | Adapters and the signed-in layout only authenticate. Every use case and query for a signed-in member takes the member as `actor` first and owns every role and ownership check, with `assertAdmin` before any lookup (4.10) | The adapter checking the role; admin-only use cases typed `actor: Admin`; an `adminOnly` wrapper | Reading a use case file must show its permission rules: with the role in the route, `createProject` looked open to anyone while `updateProject` checked. Typing `actor: Admin` would push the narrowing back into the adapter. A wrapper adds an abstraction for a one-line check. |
| D-44 | Response types and enum values in a shared `src/contract/`; the queries' mapping functions (1.8) return them | Types owned by the client and checked with `satisfies`; one model shared by database, domain and pages | A declared return type catches extra fields, which `satisfies` on a function call can't. One enum source keeps client lists complete. Rows and responses really differ (uuid vs `WEB-42`, `Date` vs ISO string, internal columns), so they stay separate types with a mapping between them. |
| D-45 | Notifications in batches with one delivery per channel; senders in `src/infrastructure/notifications/channels/`, mapped by the `notification_channel` enum | One `notification_emails` table; one deliveries table with the notification rows copied per channel | Keeps notifications independent of email so a channel (SMS) can be added with a new sender, an enum value and a profile setting. Batching and drop checks stay shared; state and retries are per channel, so one channel failing doesn't touch another. |
| D-46 | A delivery pass claims deliveries with a 2-minute lease (`locked_until`) in a short transaction, then sends outside any transaction and records the result only if the lease is still its own (1.4) | Holding the row lock in one transaction for the whole pass, so "locked" meant "being sent"; a `sending` state | Holding the lock kept a transaction and pooled connection open across up to 10 provider calls, and one bad row rolled back the pass. A `sending` state would need its own recovery and leak into the webhook, cleanup and stats. Kept for the outbox run, whose overlapping calls need it too. |
| D-47 | Domain and application code throw `DomainError` with a kind (`notFound`, `forbidden`, …) for expected failures; the action adapter returns the kind and message, and only route handlers map a kind to an HTTP status (3.2); `Result` only for the outbound email wrapper (4.8) | Glance's `Result<T, E>` returned from every use case; an `ApiError` carrying its HTTP status into domain code | Throwing keeps one catch point that maps each failure to the spec's message, and an expected failure is never logged. Keeping the status out of domain code keeps HTTP out of the entities (1.8). `Result` pays off only where a caller must handle the failure, which is `sendEmail` (invitations turn it into `unavailable`, the outbox run into a retry). |
| D-48 | Error body stays `{ error: { message, fields? } }` with the server's copy (3.2) | Glance's `{ "error": "<code>" }` with copy in the browser | All user-facing copy for server outcomes lives on the server (1.2), and STD-3 needs per-field messages. |
| D-49 | Action steps stay origin → session → schema → use case → map (1.2), with no build check | Glance's build check that answers `426 outdated` | There's no offline client or stored writes to replay against a newer server. A tab from an older build that calls an action Next.js no longer knows gets a failed call and the STD-9 toast; reloading picks up the new build. |
| D-50 | No offline outbox or sync rules in the browser | Glance's queued offline writes | Actions run straight away, and a failed board move is undone (REQ-026). Only error reports are held while offline (4.8). The server's `outbox_events` (D-70) is a different thing: events waiting to become notifications. |
| D-51 | No multi-tenant error tests | Glance's per-tenant isolation tests | One invite-only team, no tenants. |
| D-52 | No database pool error listener, and no `worker-crashed` or `sw-crashed` client events | Glance's pool listener and web or service worker crash events | postgres.js reconnects on its own and emits no pool `error` event, and a failed query surfaces at a catch point (4.8); the browser app has no web or service worker. |
| D-53 | A failed notification send logs only `sendEmail`'s `mail/*` line; the outbox run adds no `delivery-failed` line for it | Both lines, the mail line for why and the run's line for which delivery | OPS-007 logs each fault once. The status page (REQ-053) already shows which delivery failed and how often, and `delivery-failed` keeps meaning an unexpected error. |
| D-54 | The first admin is created on a welcome screen guarded by `SETUP_SECRET` from server config, with no guess limit (OPS-001, 4.6) | The `npm run setup` command; a secret generated at boot and printed to the log; counting wrong secrets in `sign_in_attempts` | The owner wanted setup in the browser, without shell access to the host. A config secret is set once and survives restarts, while a generated one would change on every restart and land in log storage. With at least 32 characters, guessing is hopeless, and a limit would only lock out the owner. |
| D-55 | **Reversed by D-61 (2026-11-05).** Was: aggregates as readonly types and pure functions returning `{ aggregate, events }`, in a `model.ts` per context | | The owner chose entity classes with recorded events, following the DDD part 8 article. Still true: only aggregates hold rules the spec can refuse, and REQ-017 lets any member move an issue to any status, so there is no status workflow. |
| D-56 | **Reversed by D-62 (2026-11-05).** Was: repositories as plain functions taking the command's `tx`, with no interfaces | | The application layer must not import infrastructure (D-60), so it needs repository interfaces. Still true: tests run against PostgreSQL, so there are no in-memory fakes and no container; actions wire the Drizzle repositories in. |
| D-57 | Reads for pages in `src/queries/`, which reads any table, writes none and returns contract types without building entities (1.8) | Each context's own reads, with listed exceptions to the context map; loading aggregates to render | Five reads already crossed the context map (issue counts, label usage, mentions). One read side ends the exceptions, and rendering changes nothing, so it needs no aggregate. |
| D-58 | **Reversed by D-70 (2026-11-05, owner decision).** Was: no generic outbox; the notification rows written on the action's transaction were the outbox, drained by a long-running worker | | See D-70. |
| D-59 | **Kept in batch H, against the DDD article.** Field edits keep the row lock (`select … for update`) and save only changed fields; only descriptions and comments carry a version (STD-8) | A `version` on every aggregate, checked on every save, as the article does | Issue edits are per-field actions and STD-8 and REQ-026 say the last save wins; a whole-row version would make two members changing different fields conflict. |
| D-60 | Four server layers, `domain`, `application`, `infrastructure` and `queries`, with the five contexts as folders inside each, and the import rules of 1.8 checked by `architecture.test.ts` | Context folders with layers by file name (`model.ts`, `repository.ts`), as before | The owner's DDD part 8 layout. The rules keep rules free of Drizzle and Next.js, so entities test without a database, and keep the context map and table ownership as they were. |
| D-61 | Entities as classes with a private constructor, `static create` (runs the rules) and `static rehydrate` (doesn't), methods that change the entity and record events, and `pullEvents()` on an `AggregateRoot` base; value objects with `static from`; no parameter properties, which `erasableSyntaxOnly` forbids | Readonly types and pure functions returning `{ aggregate, events }` (D-55) | Methods read as the domain's verbs and keep an aggregate's invariants in one class. `rehydrate` keeps old rows loadable when a rule is added. Plain field assignments in the constructor are erasable syntax, so Node and the type checker agree. |
| D-62 | Repository interfaces in `domain/<ctx>/`, Drizzle implementations and mappers in `infrastructure/<ctx>/`, and a `UnitOfWork<R>` that owns the transaction, builds the repositories a use case names on it, and before commit hands every saved aggregate's pulled events to the outbox writer | Repositories taking `tx` (D-56); a dependency container; the use case publishing events itself | The use case can't import infrastructure, so it gets its repositories through the unit of work. Pulling events in one place means no use case can save without its events or send events without saving. Each context adds its own repository factory, so the unit of work stays generic. |
| D-63 | Server actions are thin adapters, wrapped once in `src/app/_server/action.ts`: session → Valibot → one use case → `refresh()` → `{ ok: true, data }`; a `DomainError` becomes `{ ok: false, error: { kind, message, fields? } }`, and anything else is rethrown | Actions with their own checks; returning every error as a value; route handlers for every write | One wrapper keeps authentication, parsing, mapping and logging in one place, as `apiRoute` did. Expected refusals are values the form shows; unknown errors are rethrown so Next.js logs them once through `onRequestError` (OPS-007) and the browser shows the generic toast. `kind` lets the client tell a conflict or an ended session from a toast-worthy refusal without status codes. |
| D-64 | Server components read through `src/queries`, which may import domain value objects and `assertAdmin` and returns contract types; an admin-only read asserts first | Reading through use cases; reading tables in pages | Reads need no entities (D-57), and admin-only reads still check in one layer (SEC-006). Pages stay free of SQL. |
| D-65 | STD-7's delay is `DelayedFallback`: a Suspense fallback that renders nothing for 300 ms, then "Loading…" | Showing the fallback at once; a hook that times each request | A fast region never flashes a spinner, and the same component serves every `Region` and `loading.tsx`. |
| D-66 | STD-11 regions are `Region`: Suspense plus an error boundary from `catchError` (`next/error`), whose **Try again** calls `retry()`, which re-fetches the route's server data like `router.refresh()`. A refresh that fails a region replaces its data with the failed view (STD-11.4 changed in spec 0.40) | A hand-written error boundary calling `router.refresh()`; keeping old data on a failed refresh | `catchError` lets `redirect()` and `notFound()` through and clears on navigation, which a hand-written boundary would have to copy. A server-rendered region has no client cache to fall back on, so keeping stale data would need one. |
| D-67 | REQ-035 is `useLeaveGuard`: a module-level set of active guards that the app's `Link` reads through `next/link`'s `onNavigate`, plus `beforeunload`; Back and Forward aren't caught | A client router's blocker; intercepting `popstate` | The App Router has no blocking API. `onNavigate` is the documented way to stop a link (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`, "Blocking navigation"); undoing a `popstate` after the fact is fragile. |
| D-68 | NFR-005 board moves use `useOptimistic` inside the move action's transition | A client copy of the board kept in sync by hand | React drops the optimistic state when the transition ends, so a failed move rolls back by itself, and a successful one shows the refreshed board. |
| D-69 | SEC-004 for actions is Next.js's `Origin`/`Host` check plus `SameSite=Lax`; route handlers keep the origin check of 4.4 | Repeating the origin check in the adapter; CSRF tokens | Next.js aborts a cross-site action before app code runs (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`); an action without `Origin` arrives without the session cookie. A second check would test the framework. |
| D-70 | Events go to an `outbox_events` table in the action's transaction; `POST /api/cron/outbox`, called every minute by the deployment with `CRON_SECRET`, records them as notifications, sends due deliveries and runs cleanup, within 50 seconds (1.4). Reverses D-9 and D-58 | A long-running worker process (D-9); in-process event handlers writing notifications on the action's transaction (D-58); Next.js `after()` | Owner decision (2026-11-05): one app process, and the action's transaction does less. The cost is REQ-045's wait growing from 2 minutes to 2 to 3. `after()` has no completion guarantee. |
| D-71 | `job_runs` holds one row per periodic job: `outbox` (the heartbeat, every run) and `cleanup` (claimed hourly with a conditional update) | A heartbeat per process (`worker_heartbeats`); a cleanup timer in memory | Runs are separate requests with no memory between them, so when cleanup last ran must be stored. A conditional update stops two overlapping runs from both cleaning. |
| D-72 | `/health/worker` keeps its path and now checks the outbox run and the event backlog | Renaming it `/health/outbox` | The uptime check is configured outside this repository; a rename would break it for no gain. |
| D-73 | Services a use case needs besides repositories (password hashing, sign-in limits, the setup secret) are interfaces in `application/<ctx>/ports.ts`, implemented in `infrastructure/<ctx>/` and handed to the use case through the unit of work's `R` with its repositories (`infrastructure/identity/repositories.ts`) | A second dependency parameter on each use case; use cases importing `infrastructure/passwords` | The application layer can't import infrastructure (D-60), and one `R` keeps the use case signature `actor, UnitOfWork, input` (1.8). Argon2id then runs inside the transaction, about 50 ms (4.1), which this team's load allows. |
| D-74 | A refusal whose write must stay (a failed sign-in or wrong current password counts towards SEC-001) is returned out of `run` and thrown after the commit | Writing the attempt outside the transaction; a separate unit of work for the attempt | Throwing inside `run` would roll back the attempt row and the limit would never trip. Returning keeps the write in the one transaction. |
