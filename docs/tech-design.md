# Tracklite: Technical design

Companion to `docs/tracklite-spec.md` (v0.30). The spec says *what* the product does; this file records only the technical decisions the spec leaves open. If they disagree, the spec wins and this file gets fixed.

## 1. Architecture

### 1.1 What runs where

```
 browser ──HTTPS──▶ reverse proxy ──▶ tracklite-web (next start)  ──┐
                                                                     ├──▶ PostgreSQL 18
                                    tracklite-worker (node)  ────────┘
                                              │
                                              ▼
                                   email provider HTTP API
 uptime checker ──GET /health, /health/worker──▶ (through the proxy)
 email provider ──POST /webhooks/email──▶ (through the proxy)
```

Deployment (servers, the reverse proxy, process supervision, deploys, rollbacks, backups and log retention) is maintained outside this repository. The app expects the following from it.

| Process | What it does |
|---|---|
| **Reverse proxy** | Terminates TLS, redirects HTTP to HTTPS and sends HSTS and the 4.9 headers (SEC-005). It also overwrites `X-Forwarded-For` with the client's address, and the app reads the rightmost entry for SEC-001's per-IP limit, so a client can't choose the address that limit counts. Its access log drops the `token` query parameter (SEC-007). |
| **tracklite-web** | `next start`: the single-page-app shell (1.7), `/api/…`, `/health`, `/health/worker`, `/webhooks/email`. Restarted if it exits. |
| **tracklite-worker** | A small Node entry point, `scripts/worker.ts`, run with `tsx` from the same codebase. It sends notification emails and runs cleanup (1.4). Restarted if it exits. |
| **PostgreSQL** | All state, including the notification queue. |

### 1.2 Request flow

**Pages.** Every page address returns the same HTML shell. The browser app then does the routing, the signed-out redirects (STD-1) and all data loading, through the API (1.7). Every read and write therefore goes through the same API code and the same permission checks (SEC-006).

**API.** Each handler is wrapped in `apiRoute`, which runs these steps in order:

1. Reject cross-site writes with `403` (4.4).
2. Validate the session with `requireMember`. This step only says who is asking; it checks no role. A route declared `"public"` (sign-in, password resets, invitation lookups and acceptance, sign-out) skips it.
3. If the route declares a body schema, parse the JSON body and validate it with Valibot (D-42), failing fast with `422`. The schema checks shape and format only, with the spec's own messages, and passes the parsed, trimmed values on.
4. Call one domain function in its context's `index.ts` under `src/server/` (1.8), passing the signed-in member as its first argument, `actor`. `apiRoute` opens no transaction; the domain function opens its own with `db.transaction`. The domain function checks permissions (4.10), then the rules that need the database (a key already used, the last admin), and writes. The action and any notification rows it creates commit together (spec §12).
5. Map a thrown `ApiError` to `401`/`403`/`404`/`409`/`410`/`422`/`429`/`503` with `{ error: { message, fields? } }`. Map anything else to `500`.
6. Write one JSON log line per request, without bodies or tokens (SEC-007). A signed-in request's line names the member as `actor` by username. `/health`, `/health/worker` and `/webhooks/email` don't go through `apiRoute`, so they write no line; Caddy's access log records them.

### 1.3 Time

Every expiry and time-window check uses the database's `now()` inside the query (`expires_at > now()`, `send_after <= now()`). The app server's clock is never used for these, so there's only one clock to trust. The app's connection sets the session time zone to UTC, so a window such as `interval '7 days'` is always exactly 168 hours, even across a daylight-saving change. The one exception is the webhook's 5-minute signature window (5.4), which compares the provider's timestamp with the app's clock, since there's no row to compare in SQL. Tests move stored timestamps into the past rather than faking the clock. For example, a test for REQ-050.4 sets `expires_at = now() - interval '1 minute'`.

### 1.4 Background worker (DEC-004)

`scripts/worker.ts` runs `runWorker` until `SIGTERM`. The worker works in **passes**. A pass never holds a transaction open while a provider is called, and nothing that goes wrong with one delivery ends the process.

1. **Heartbeat.** Upsert the `worker_heartbeats` row named `worker` with `last_pass_at = now()` (2.6). `/health/worker` and the status page read it (OPS-005, REQ-053).
2. **Claim.** One short transaction picks up to 10 deliveries that are `pending`, due (`coalesce(next_attempt_at, send_after) <= now()`, with `send_after` from the batch) and not leased (`locked_until is null or locked_until <= now()`), `order by send_after for update of notification_deliveries skip locked`. It sets `locked_until = now() + interval '2 minutes'` on them, returns that value as the pass's **lease**, and commits. Two minutes covers a full pass at the provider's 10-second timeout (5.2), 10 × 10 s.
3. **Each claimed delivery**, one after another (sends are never concurrent):
   - **Drop checks** (2.6) in one short transaction: mark notifications no longer wanted as dropped and, if none is left, record `dropped`. The data the checks need is loaded once for the whole pass, before the first delivery (2.6).
   - **Send** outside any transaction: the delivery's channel gets the kept notifications and the delivery's `id` (2.6).
   - **Record** in one statement: `sent` (with `provider_message_id` and `sent_at`), a retry (`attempts + 1`, `next_attempt_at`, `locked_until = null`), or `failed`. Every write in this step and the drop step applies only while the delivery is `pending` with `locked_until = <the pass's lease>` (the drop step checks that by locking the delivery row first), so a pass whose lease ran out and was taken over can't overwrite the newer pass's result. The lease is compared inside SQL, as the exact database value, never as a JavaScript `Date`, which would lose the microseconds.
4. **Errors stay with their delivery.** Everything in step 3 for one delivery runs inside one `try`. An unexpected error, such as a bug in the drop checks or a dropped database connection, counts as a failed attempt, with the same retries as a failed send (2.6: 1, 4 and 10 minutes, then `failed`). It's logged as `event: "notification"` with the delivery's `id` and the error's name, never the recipient or any text (SEC-007). The pass then carries on with the next delivery. If recording the failure fails too, the lease runs out and a later pass picks the delivery up again. An error outside any delivery (the heartbeat, the claim, loading the drop-check data), for example while PostgreSQL restarts, is logged the same way and ends the pass; claimed deliveries come back when their lease runs out, and the worker waits 5 seconds before the next pass. A metrics or cleanup error is logged and the worker carries on.
5. **Next pass.** If the claim returned a full 10, the next pass starts straight away, so a backlog drains at the provider's pace. Otherwise the worker sleeps 5 seconds.
6. **Metrics.** At most once a minute, after a pass, the worker logs one JSON line, `event: "worker"`, with `pending`, `due`, `oldestDueSeconds` (both counted in SQL against `now()`), and the `sent`, `failed` and `dropped` counts since the previous line. It holds no recipients and no text.
7. **Cleanup (DATA-004)** runs once an hour between passes, in chunks (2.7).

How it meets DEC-004's requirements:

- **Survives a restart.** The queue is the `notification_deliveries` table, so pending notifications survive a crash or deploy, and the worker is restarted. A delivery claimed by the crashed process is picked up again by a later pass once its lease runs out, at most 2 minutes later.
- **No paid queue.** It's Postgres plus one Node process.
- **Delivered at least once.** If the worker dies after the provider accepted a message but before it was recorded, the delivery is sent again after its lease runs out. The same happens if a send outlasts its lease and another pass reclaims it. Both sends carry the delivery's `id` as Resend's `Idempotency-Key`, so Resend drops the duplicate (section 5).
- **Safe to run twice.** `skip locked` and the lease mean a second worker, for example while a deploy is switching over, never claims a delivery whose lease is still running.
- **Shutdown.** On `SIGTERM` or `SIGINT` the worker claims nothing more. It finishes and records the deliveries already claimed in the current pass, then exits. A sleep in progress ends at once. The process supervisor may cut off a slow pass; its deliveries come back when the lease runs out, as after a crash.

### 1.5 Emails sent during the request

Invitations (REQ-001) and password reset links (REQ-050) are **not** queued. They're sent inside the request, because STD-6 needs to know whether the send worked before answering.
- The token row is written first, then the email is sent, all in one transaction.
- If the send fails, the transaction rolls back, so no working link exists that nobody received, and the API answers `503`.

All email goes through one `sendEmail()` (5.2).

### 1.6 Configuration

- Settings come from environment variables: `.env.local` in development, and the deployment's server config in production (OPS-006).
- Both processes check them at startup and refuse to start if any are missing.
- Settings: `DATABASE_URL`, `APP_URL` (for links in emails), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `EMAIL_FROM` (section 5). `MAILPIT_HOST` and `MAILPIT_PORT` are optional and default to `localhost` and `8025`.
- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are required only when `NODE_ENV` is `production`; development sends through Mailpit and tests through the in-memory outbox (5.2).
- Tests run against `TEST_DATABASE_URL`, which must differ from `DATABASE_URL`. Before each run its schema is dropped and the migrations applied afresh.

### 1.7 Browser app (single-page app)

Strict single-page app, as the Next.js docs define it: the app is served by one HTML document, and every route change, page transition and data fetch happens in the browser, with no full-page reloads.

**The shell.**
- `src/app/layout.tsx` holds `<html>`, `<body>`, the fonts (`next/font/google`, served from the app so the CSP's `font-src 'self'` holds) and the Track Lite stylesheet.
- One optional catch-all page, `src/app/[[...path]]/page.tsx`, renders `<ClientApp />` through `next/dynamic` with `ssr: false`. It's the same document for every address.
- `/api`, `/health` and `/webhooks` are more specific routes, so they're never caught by it.
- `src/proxy.ts` only sets the Content Security Policy and `Referrer-Policy` (4.9). It doesn't redirect pages; the browser app does.

**Routing.** React Router in data mode (`createBrowserRouter`), with routes lazy-loaded so each screen's code is downloaded on first visit.
- The route table is the API-004 list (6.1).
- `useBlocker` provides the unsaved-text prompts (REQ-035, 6.4). That's the main reason to use React Router rather than hand-rolled `history.pushState`.

**Signed-in state (STD-1).**
- On startup the app calls `GET /api/me`:
  - `401` → go to `/sign-in?next={current address}`;
  - success → the member is kept in the RTK Query cache and the requested route renders.
- `/sign-in` and `/` send a signed-in member to `/my-issues`.
- **Return after sign-in (SEC-009).** `next` is used only if it starts with `/` but not `//` or `/\`; anything else goes to `/my-issues`. So `?next=https://evil.example` can't send anyone off-site.
- Any `401` later, such as an expired session or a deactivated member mid-edit (REQ-007.4), does the same redirect from the shared `baseQuery`, except on the signed-out pages (`/sign-in`, `/forgot-password`, `/reset-password`, `/invite`).

**Redux Toolkit.** One store, created once in `ClientApp` and provided through `react-redux`.

- **RTK Query** (`createApi`, one `api` slice) holds all server data. The `baseQuery`:
  - wraps `fetch`, sends JSON and parses `{ error: { message, fields? } }`;
  - on `401`, redirects to sign-in;
  - leaves every other error to the component, which shows field errors (STD-3), an editor conflict (`409`, STD-8), or a toast.
- **Fresh data on every visit.** Queries use `refetchOnMountOrArgChange: true`, so each screen loads current data when opened. That matches "pages show current data when they load" (spec §12). There's no `refetchOnFocus` and no polling: no live updates in R1, and REQ-041.6 expects an open page to stay as it is.
- **Tags drive refreshing.** Tags are per type, with no IDs: `Me`, `Members`, `Invitations`, `Projects`, `Labels`, `Issue`, `Board`, `Comments`. A successful mutation invalidates the type it changes (`updateMember` also `Me`), and a mounted screen showing that data refetches. Label updates and deletes, comment deletes and board moves also invalidate on a `404`, since the row was deleted meanwhile. `updateIssue` instead writes the saved issue into the `issue` cache, and invalidates `Labels` only on a `404` (a label deleted meanwhile). Creating or deleting an issue, and deleting a project, invalidate nothing, because the app then navigates to a screen that refetches on mount (the project delete also invalidates `Projects` for the sidebar). The list, My issues and the notification status carry no tags; they rely on the refetch on every visit.
- **Optimistic board moves (NFR-005, REQ-026).** `moveIssue` updates the cached board in `onQueryStarted` before the request goes out. If the request fails, it undoes the change and shows a toast: the server's message, or "Couldn’t move WEB-42" for a network error or a `5xx`. If it succeeds, or fails with `404` because the card was deleted meanwhile (REQ-026.5), it invalidates `Board`, which refreshes the board on screen.
- **UI slice:** one `toast` slice (STD-9: one message at a time, 5 seconds, no dismiss).
- **Kept out of Redux on purpose:**
  - list-view filters, search and sort live in the URL (`useSearchParams`), since REQ-040 already makes the URL their home. The parameters are the list endpoint's (3.3), with enum values as their keys, such as `status=in_progress`. A filter or sort change adds a history entry; search replaces the current one, so Back doesn't step through each typed word;
  - form drafts live in component state.

**Request IDs (STD-5).** A create form generates `crypto.randomUUID()` once, when the form opens or is reset, and reuses it for every retry of that submit.

**Loading states (STD-7).** One shared hook shows the loading indicator only after a request has been pending for 300 ms.

### 1.8 Bounded contexts

`src/server/` is split into bounded contexts. Each context is a folder with a public `index.ts`, and other contexts, routes (`src/app/`) and `scripts/` import it only through that file. Domain functions keep the style of 1.2 and 4.10: `actor` first, their own transaction, Drizzle inside. A context's request schemas live in its `schemas.ts` (D-42), and each test sits next to its source. The client is out of scope.

| Context | Holds |
|---|---|
| `src/server/identity/` | sessions, members, sign-in, profile, setup, invitations, password resets, sign-in and reset limits, the dev seed, expired account rows; the account, invitation, member, password and profile schemas |
| `src/server/notifications/` | notifications, the notification queue, notification stats, `notification-channels/`, the worker, expired-row cleanup, the email webhook, mentions (`descriptions.ts`), the domain-event subscriber |
| `src/server/projects/` | projects, labels; their schemas |
| `src/server/issues/` | issues (`create.ts`, `update.ts`, `board.ts`, `list.ts`, `rows.ts`); its schema |
| `src/server/comments/` | comments; its schema |
| `src/server/shared/` (infrastructure) | db, schema (enums and column helpers), config, log, api-error, api-route, `email/`, tokens, passwords, chunked-delete, domain events (`events.ts`); the schema helpers every context uses (`schemas.ts`, including the description schema) |

**Allowed dependencies.** `comments` → `issues`, `projects`; `issues` → `projects`; `notifications` → `comments`, `issues`, `projects` (reads for its drop checks and snapshots); every context → `identity`, `shared/`; `identity` → `shared/` only. No context but `notifications` imports `notifications`. No cycles. `shared/` holds no domain rules and is imported by file, not through an index; its imports of a context are `api-route.ts` taking `requireMember` from `identity` and importing `notifications` for its event subscription. `src/server/architecture.test.ts` fails on an import that reaches past another context's `index.ts` or breaks these directions. Within a context, files import each other freely. Test files (`*.test.ts`, `*.test.tsx`) and the helpers in `src/test/` also import other contexts only through their `index.ts`, but are exempt from the directions, because they build fixtures across contexts (the notification and worker tests create projects, issues and comments).

**Table ownership.** Each context owns its tables. Only the owning context inserts, updates or deletes a table. Another context may read it in a join, through the table its owner exports from `index.ts`, because splitting every join into calls would cost queries for nothing at this size. Enums and shared column helpers stay in `shared/schema.ts`; each context's tables are in its `tables.ts`, exported from its `index.ts`, and `drizzle.config.ts` reads all of them. A `tables.ts` imports another context's `tables.ts` directly for its foreign keys; the foreign-key graph runs `notifications` → `comments` → `issues` → `projects` → `identity` and has no cycles. Five reads point against the context map: `projects/labels.ts` counts `issue_labels`, `projects/projects.ts` counts `issues` per status for project details (REQ-046.3), and `issues/rows.ts`, `comments/comments.ts` and `projects/projects.ts` read `mentions` to list who a text mentions. They import the owner's `tables.ts` directly, which loads only table definitions, so no import cycle forms; `architecture.test.ts` lists each one. `M16: a context writes only its own tables` fails on an `insert`, `update` or `delete` of another context's table outside test code; test files and `src/test/` (including the NFR-001 load data, `src/test/seed-load.ts`) may write any table to build fixtures. A context that needs another's table changed calls a function the owner exports (`takeIssueNumber`, `markInvitationBounced`, `deleteExpiredAccountRows`).

| Context | Tables it owns |
|---|---|
| `identity` | `members`, `invitations`, `password_reset_tokens`, `sessions`, `sign_in_attempts`, `password_reset_requests` |
| `projects` | `project_keys`, `projects`, `labels` |
| `issues` | `issues`, `issue_labels` |
| `comments` | `comments` |
| `notifications` | `mentions`, `notification_batches`, `notification_deliveries`, `notifications`, `worker_heartbeats` |

**Glossary.** The words code, spec and UI share, by owning context. The code name is the table, type or column that holds the term in `src/server/` and `src/contract/`.

| Context | Term | Meaning | Code name |
|---|---|---|---|
| `identity` | member | a person with an account; `role` is `admin` or `member` | `members`, `Member`, `MemberSummary`, `Me` |
| `identity` | username | a member's lowercase handle, used in addresses and mentions | `username` |
| `identity` | invitation | an admin's email invite; its state (Pending, Accepted, Revoked, Bounced, Expired) is derived (2.2) | `invitations`, `Invitation` |
| `projects` | project | a named container for issues, possibly archived | `projects`, `Project`, `ProjectSummary`, `archivedAt` |
| `projects` | key | a project's short uppercase code, reserved forever | `key`, `project_keys` |
| `projects` | label | a coloured tag belonging to one project | `labels`, `Label`, `LabelColor` |
| `issues` | issue | a unit of work in one project | `issues`, `Issue` |
| `issues` | issue ID | the project key plus a number, `WEB-42`; the database `uuid` is never shown | `Issue.id`, `number` |
| `issues` | status | where an issue is in the workflow; a board column | `status`, `IssueStatus` |
| `issues` | priority | how urgent an issue is | `priority`, `IssuePriority` |
| `issues` | position | an issue's sort key within its board column (2.4) | `position` |
| `comments` | comment | a message on one issue or one project | `comments`, `ThreadComment` |
| `notifications` | mention | an `@username` in a description or comment, mirrored as a row (2.5) | `mentions` |
| `notifications` | notification | one thing to tell a member: `assigned` or `mentioned` | `notifications`, `notificationKind` |
| `notifications` | batch | the notifications a recipient gets together about one target (2.6) | `notification_batches` |
| `notifications` | delivery | one batch sent over one channel, with its state | `notification_deliveries`, `deliveryState`, `ProblemDelivery` |

**Typed identifiers (M16.3).** Identifiers are branded types, each with one parse function, made at the edge (the context's `schemas.ts`) and passed inward: `IssueId` (`WEB-42`) in `issues`, `ProjectKey` in `projects`, `Username` in `identity`, `RequestId` and `Uuid` in `shared/` (replacing `isUuid` in `shared/ids.ts`). Domain functions take the branded types, so an unchecked string doesn't compile. Parsing normalises once (keys uppercase, usernames lowercase), so lookups ignore case without each query doing it.

**Pure rules (M16.4, M16.5).** Each context keeps the decisions that need no database in its `rules.ts`, as pure functions over plain types, tested by its `rules.test.ts` without a database. A domain function reads as load → decide → write: load rows in its transaction, call the rules, write the result.
- `issues/rules.ts`: board positions, status and priority changes, label changes, what an edit may touch.
- `projects/rules.ts`: archived-project and key rules.
- `comments/rules.ts`: edit and delete ownership. `notifications/rules.ts`: mention parsing (which members a text newly mentions).
- `identity/rules.ts`: the last admin, invitation state and reset-link rules.

Permission checks stay where 4.10 puts them: `assertAdmin(actor)` is still an admin-only function's first statement, before any load.

**Domain events (M16.6).** `shared/events.ts` holds `DomainEvent`, a typed union of the facts that cause notifications in R1: `IssueAssigned`, `DescriptionSaved` (issue or project), `CommentPosted` and `CommentEdited`. Each carries the actor, the target ids and, for text, the saved text; which members a text newly mentions is worked out by `notifications`, which owns `mentions`. `publish(tx, event)` hands an event to the one subscriber and throws if none is registered, so a missing import fails loudly instead of dropping notifications. A context publishes inside its own transaction; `notifications` subscribes when its `index.ts` loads and writes its rows (mentions, batches, deliveries, notifications) on the same `tx`, so the action and its notifications commit or roll back together (spec §12). `shared/api-route.ts` and `scripts/worker.ts` import `notifications`, and the `unit` test project loads it in a setup file (`src/test/subscribe-notifications.ts`), so tests that call domain functions directly have the subscriber.

The edit-conflict `409` (`editConflict`, naming the last editor) moved from `notifications` to `identity`, and the description schema to `shared/schemas.ts`, since neither is about notifications. The dependency map is the **Allowed dependencies** paragraph above.

## 2. Schema

PostgreSQL via Drizzle ORM, connected through the `postgres` (postgres.js) driver (`drizzle-orm/postgres-js`). Enums and column helpers are in `src/server/shared/schema.ts`, and tables, columns, constraints and indexes in each context's `tables.ts` (1.8); `drizzle-kit generate` writes migrations to `migrations/`. This section records only why the schema is shaped as it is. Every table has a `uuid` id unless stated (`project_keys` is keyed by `key`, `issue_labels` by its pair), and every timestamp is `timestamptz` in UTC (DATA-003).

### 2.1 Enums

Postgres sorts an enum by its declared order, so the order is the sort order. `issue_status` is declared `backlog`, `in_progress`, `in_review`, `done`, `canceled`, so `ORDER BY status` gives the REQ-017 order (REQ-039). `issue_priority` is declared `urgent` to `none`, so `ORDER BY priority` puts Urgent first and No priority last (REQ-039, REQ-042). `label_color` holds the spec's 8 colours (6.6).

### 2.2 Accounts and sign-in

**`members`**
- Usernames are lowercased before saving (REQ-003.1), so a plain unique index on `username` is enough; emails are unique on `lower(email)`.
- Never deleted (section 8 of the spec), so foreign keys pointing at members keep the default `no action`, which blocks deleting a referenced member.
- **Keeping the last admin (REQ-007.3, REQ-052.3).** Removing admin or deactivating first locks every active admin row (`select id from members where role = 'admin' and deactivated_at is null for update`), then refuses if the target is the only one. Two admins demoting each other at once are serialised by the lock, so the second sees one admin left and is refused.
- **Role changes apply on the next request (REQ-052).** `requireMember` reads the role from the database on every request; nothing caches it in the session.

**`invitations`**
- The spec's state is derived, not stored: Accepted if `accepted_at` is set, Revoked if `revoked_at` is set, Bounced if `bounced_at` is set, Expired if `expires_at < now()`, otherwise Pending.
- `provider_message_id` is the Resend ID of the latest email, so the bounce webhook can find the invitation (5.4). A resend replaces it and clears `bounced_at`.
- A partial unique index on `lower(email)` where `accepted_at is null and revoked_at is null` allows at most one open invitation per email. Inviting an email again replaces that row's `token_hash` and `expires_at`, which is how a resend works (REQ-001.3). The old link stops working because its hash no longer matches.

**`password_reset_tokens`**: a successful reset sets `used_at` on that row **and** on all the member's other unused rows (REQ-050.6).

**`sessions`**
- A session ends by deleting its row (4.3). DATA-004's 30-day limit is a maximum, so deleting at once complies.
- A session is valid while `last_active_at > now() - 30 days` (REQ-006). To avoid a database write on every request, `last_active_at` is only rewritten when it's more than 1 hour old. At most 1 hour of the 30 days is lost, which is acceptable.

**`sign_in_attempts`** (failed sign-ins and wrong current passwords, REQ-049.3) and **`password_reset_requests`** have no `id`. SEC-001 counts the last hour's rows, so each is indexed on `(email, created_at)` and `(ip, created_at)`.

### 2.3 Projects and labels

**`project_keys`** has one row per project key, inserted with the project and **never deleted**. That's what reserves the key forever (REQ-009.3), while the project row itself can be hard-deleted with a cascade (DATA-002).

**`projects`**: `description_edited_by` is the member who last saved the description, named in the STD-8 conflict message. If you saved from another tab, the message names you. Issues have the same column. `created_by` is the admin who created the project (REQ-046.4); it is nullable because projects created before it was added have no recorded creator.

**`labels`** are unique per project ignoring capitals, on `(project_id, lower(name))` (REQ-021.2).

### 2.4 Issues

- **Numbering (REQ-016).** The create transaction locks the project row (`for update`, the same read that checks it isn't archived), then runs `update projects set next_issue_number = next_issue_number + 1 where id = $1 returning next_issue_number - 1`. The row lock makes two people creating at the same moment wait for each other, so they get different numbers (REQ-016.4). Deleting an issue never decrements the counter, so numbers aren't reused (REQ-016.2).
- **Board position (REQ-026, REQ-027).** `position` is a string sort key from the `fractional-indexing` package. The column is `text COLLATE "C"`, because the keys only sort correctly byte by byte (`Zz` before `a0`); a database whose default collation is a language one, such as `en_US.UTF-8`, would put a card moved to the top at the bottom. A drop between two cards generates a key between theirs; "move to top" generates a key before the column's first card. Only the moved row changes, so two members reordering different cards don't conflict (REQ-026.3). Columns sort by `(position, id)`: if two moves land between the same pair at once, they may get equal keys, and `id` breaks the tie consistently for everyone.
- **Moving a card.** A move names one neighbour (`place: { after: "WEB-5" }`), not the keys around it. The server computes a key between WEB-5 and whatever card follows WEB-5 *right now*, so a board that's out of date still lands the card next to the one the member chose (REQ-026.4). If WEB-5 is no longer in that column, the card goes to the top. A move changes `status` and `status_changed_at` only when the status actually changes. A status change from anywhere else (`PATCH { status }`) also puts the card at the top of its new column (REQ-027.4).
- **`updated_at` (REQ-036).** Set when the title, description, status, priority, assignee or the issue's labels change. Not set by reordering within a column (REQ-036.5), comments, or renaming or recoloring a label on the Labels page.
- **`status_changed_at`.** Set on every status change, and drives the 14-day Done/Canceled window (REQ-028, REQ-041).
- **`description_version`.** Incremented on each description save. A save sends the version it started from. The transaction locks the row (`for update`) and compares the stored version with the sent one; if they differ, someone else saved first → the STD-8 conflict message. Changes to other fields don't touch it, so a status change by a teammate never blocks your description save. Projects use the same pattern.
- **Labels.** A label change sends the issue's full set (`labelIds`), which replaces its `issue_labels` rows. The 10-label maximum (REQ-020.3) is checked by the body schema.

**Search (REQ-038).** One condition per typed word, combined with `and`. The issue matches if the word appears in the title, the description, or its ID (`key || '-' || number`), each checked with `ILIKE '%word%'`, where `%`, `_` and `\` in the word are escaped first (REQ-038.4). GIN `gin_trgm_ops` indexes on `title` and `description` keep this fast at 10,000 issues (NFR-004). They need the `pg_trgm` extension, which drizzle-kit can't declare, so the first migration runs `create extension if not exists pg_trgm` (added by hand).

### 2.5 Comments and mentions

**`comments`** each belong to exactly one issue or one project (a `num_nonnulls` check).

**`mentions`** record who a text mentions. Exactly one of `issue_id` (an issue's description), `project_id` (a project's description) or `comment_id` is set (REQ-044).
- The rows always mirror the **current** text. Each save parses the mentions (DATA-001), inserts the new ones and deletes the removed ones. "Mentioned for the first time" (REQ-044) means "not in the text before this save". So if a mention is removed and later added back, that member is emailed again, as the spec requires (REQ-044).

### 2.6 Notifications

Notifications don't know how they're delivered. Three tables keep the *what*, the *grouping* and the *how* apart:

**`notification_batches`** has one row per group of notifications a recipient gets together about one issue or project (`target_type`, `target_id`), with its `send_after` (REQ-045). It has no channel and no state.

**`notifications`** has one row per notification, in the batch it's combined into, with a **snapshot** of what any message needs: issue ID, issue title, project name and key, link path, and a plain-text excerpt of up to 500 characters (then "…").

**`notification_deliveries`** has one row per batch and channel (`channel`, unique per batch), with its `state`, retry count, next attempt and the provider's message ID. The channels come from **`members.notification_channels`** (at least one; `{email}` by default and the only choice in R1) when the batch is created, so a later change of channels applies to the next batch.

**`notification_deliveries.locked_until`** is the lease a worker pass holds on a delivery it claimed (1.4); `null` when no pass holds it. A partial index, `notification_deliveries_pending_idx` on `(batch_id) where state = 'pending'`, serves the claim and the queue counts: the due time comes from the batch (`send_after`), so no single-table index can order by it, but the partial index holds only pending rows, a handful at a time, each joined to its batch by primary key. It stays small however much history the table keeps.

**`notification_deliveries.state_changed_at`** is when the delivery reached its current state: set with `now()` whenever the worker records `sent`, `dropped` or `failed`, and when the bounce webhook records `bounced`; `null` while `pending`. The status page counts and lists by it (REQ-053).

**`worker_heartbeats`** has one row per worker process name (`name text primary key`, `last_pass_at timestamptz not null`). The worker upserts the row named `worker` at the start of every pass (1.4).

**Channels.** `src/server/notifications/notification-channels/` has one module per channel, and an index maps every value of the `notification_channel` enum to its sender: `send(recipient, notifications, deliveryId) → { providerMessageId }`. The email sender builds the message with the templates (5.3) and calls `sendEmail()` (5.2). The map is typed by the enum, so adding a channel to the enum doesn't compile until its sender exists; nothing in `notify()` or the worker changes.

Some lookups and cascades have no index on purpose: `provider_message_id` (here or on `invitations`), `notifications.batch_id`, `notification_batches` by recipient and target, `notification_deliveries.state_changed_at`, `sessions.member_id`, `issue_labels.label_id`, and `mentions` by issue, project or comment (its unique indexes start with `member_id`). At one team's volume these scan small tables; add an index if one shows up in NFR-003 timings.

How the parts fit:

- **No FKs to issues, projects or comments.** Notifications about deleted issues and projects must still be sent (REQ-045.7), so these rows can't be cascade-deleted. The snapshot means the message can be built after its target is gone.
- **Joining a batch (fixed wait).** In the same transaction as the user's action (spec §12), look for a batch for that recipient and target with `send_after > now()`. If one exists, attach to it; if not, create one with `send_after = now() + 2 minutes` and one `pending` delivery per channel of the recipient. A later notification never moves `send_after` (REQ-045.8) and adds no deliveries. If two members act at the very same moment, the recipient can occasionally get two messages instead of one; that's accepted rather than adding a lock.
- **Drop checks at send time (REQ-045).** For each delivery, the worker re-checks each of the batch's notifications not yet dropped:
  - recipient deactivated → drop;
  - target issue or project no longer exists → **send** (REQ-045.7);
  - `assigned` but the issue's assignee is now someone else → drop;
  - `mentioned` but the comment is gone, or there's no longer a matching `mentions` row → drop.

  A dropped notification stays dropped for every channel. If none is left, the delivery becomes `dropped`.

  The data for these checks is loaded once per pass, for all the deliveries it claimed, with a fixed number of queries whatever the number of notifications: the recipients; the batches' notifications not yet dropped; the target issues and projects that still exist; and, in one query, the `mentions` rows of those recipients for those targets and for the comments the notifications name. The checks then run in memory. A change made while the pass is sending (a few seconds) isn't seen by that pass, which is the same as a change made a moment after the send.
- **Retries (STD-6), per delivery.** After a failed send, `attempts += 1` and `next_attempt_at` moves forward 1, then 4, then 10 minutes. After the third retry fails, the state becomes `failed`. A bounce sets `bounced` and isn't retried.

### 2.7 Deleting and cleanup

- **Deleting a project (DATA-002):** cascades to issues, labels, issue_labels, comments (both issue and project comments) and mentions. `project_keys` and notifications stay.
- **Deleting an issue:** cascades to issue_labels, comments and mentions.
- **DATA-004 cleanup:** an hourly job deletes rows older than their retention period, using `now() - interval`. These are among the few queries written in raw SQL. Each table is deleted in chunks: one statement deletes at most 1,000 matching rows (`where ctid in (select ctid … limit 1000)`) in its own transaction, and repeats until a statement deletes fewer than 1,000. No long transaction holds locks or delays the worker's next pass.

## 3. API

Settles DEC-002. Request types live in each context's `schemas.ts` (1.8) and response types in `src/contract/` (3.5); this section fixes paths, permissions and errors.

### 3.1 Conventions

- **Format.** JSON in and out. Times are ISO 8601 strings in UTC (DATA-003).
- **Addressing.** Issues by ID (`WEB-42`), projects by key (`WEB`), and members by username. All are matched ignoring capitals (REQ-016.5). Labels, comments and invitations use their `uuid`.
- **Unknown paths.** A catch-all, `src/app/api/[...path]/route.ts`, answers `GET`, `POST`, `PUT`, `PATCH` and `DELETE` on an unknown `/api` path with `404` "Not found". It needs a session, so a signed-out caller gets `401` and learns nothing about which paths exist.
- **No tokens in paths.** Invitation and reset tokens always travel in the request body. The `?token=` on the invitation and reset *pages* (API-004) is kept out of logs by 4.8 and 4.9.
- **List paging** uses `offset`, not keyset cursors, which several sort columns would make complex. With no live updates (spec §3), rows only shift if someone else edits mid-scroll, and that's accepted.
- **Field-by-field saves.** The issue page saves each field as soon as it changes, with a `PATCH` that holds only that field. That's what makes STD-8's "last save wins" work per field. It also means one failed field leaves the others saved (REQ-020.4).
- **Creating twice.** Creates of issues and comments carry `requestId`. A repeat returns the first result with `200` instead of `201` (STD-5). `request_id` is unique across the whole table. The repeat is looked up after the target's own checks, so a retry to an issue deleted meanwhile gets `404`, and into a project archived meanwhile gets `403`.
- **Small member data.** A member appears in responses as `{ username, fullName, initials, deactivated }`. A member's email appears only in a full profile: `/api/me`, the admin member list, an admin's `PATCH /api/members/{username}`, and the new member's own `POST /api/members`. An invited email appears in the admin's invitation responses and in the invitation lookup. Password hashes never appear (SEC-008.2).

### 3.2 Errors

Every error body is `{ error: { message, fields? } }`, and the browser shows `message` as-is. That keeps all user-facing copy for server-side outcomes in one place.

| Status | When | Browser shows |
|---|---|---|
| `401` | No valid session: signed out, expired or deactivated (STD-1, REQ-007.4) | Redirect to `/sign-in?next=…` |
| `403` | Not allowed (STD-2), a cross-site write (SEC-004), or a write to an archived project (REQ-013.4) | Toast (STD-9) |
| `404` | The target doesn't exist, and the message names it. Reading a missing issue or its comments gets "Not found"; a write to one gets "This issue was deleted" | Not-found page on load (STD-4); toast on save (STD-9) |
| `409` | Stale save of a description or comment (STD-8) | Message in the editor; text kept |
| `410` | An invitation or reset link that's expired, used or revoked (REQ-002.2, REQ-002.4, REQ-050.4) | The page's expired state |
| `422` | Invalid input. With `fields`: one error per field (STD-3). Without `fields`: a form-level refusal, such as the last admin or a wrong sign-in | Next to the fields, or beside the form |
| `429` | A SEC-001 limit | Beside the form |
| `503` | An invitation or reset email couldn't be sent (STD-6) | Toast |
| `500` | Anything else | The DEC-006 toast or error state |

Rules that need the database answer with a field error when one field is at fault: a key, label name or username already taken, or a wrong current password. Inviting someone who is already a member, or deactivated, is a form-level refusal.

Changing a field that can't be changed (username, email, project key) gets `422` with a field error. The stored value stays as it was (REQ-003.3, REQ-010.1).

A body schema failure gets `422` with "Check the highlighted fields" and the first failing rule's message for each field (STD-3). A rule on the body as a whole, such as "Change one field at a time" on an issue `PATCH`, gets `422` with its own message and no `fields`. A field missing from the body gets the field error "Required". A body that isn't valid JSON, or isn't a JSON object, gets `422` "Couldn’t read the request." with no `fields`. The browser never sends either, so this only keeps such requests from becoming a `500`. Query strings and path segments aren't covered by schemas.

### 3.3 Endpoints

"Member" means any signed-in active member. Every write to something inside an archived project (its description, issues, comments, labels) gets `403` "This project is archived". Admins can still unarchive or delete an archived project; renaming it gets the same `403`.

The domain functions declare the contract types (3.5) as their return types. The tables give only what the types can't say.

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

**Members and invitations**

| Method and path | Notes | Who | Spec |
|---|---|---|---|
| `GET /api/members` | All members, active and deactivated, for the assignee picker, the @mention suggestions and the members page; with about 15 people the browser filters the list itself | Member (emails only for admins) | DATA-001, REQ-037 |
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
| `GET /api/projects/{KEY}/issues` | Filters `status`, `priority`, `assignee` (`-` for Unassigned) and `label` (name, ignoring capitals), each repeatable; `q`; `sort` (default `updated`) and `dir` (default `desc` for `updated`, `asc` otherwise); `offset`. Ties sort most recently updated first, and unknown values are ignored. Up to 100 rows, plus the deactivated members still assigned in the project, for the assignee filter | Member | REQ-036…040 |
| `POST /api/projects/{KEY}/issues` | `201`. `status` is used by the column **+** buttons; a missing or unknown value becomes `backlog` | Member | REQ-016, REQ-029 |
| `GET /api/issues/{ID}` | Includes the description's version and mentions | Member | REQ-016 |
| `PATCH /api/issues/{ID}` | One field per request (3.1): title, status, priority, assignee, the full label set, or a description save | Member | REQ-016…022, REQ-027.4 |
| `PUT /api/issues/{ID}/position` | A status and a place: top, bottom, or after a named card (2.4) | Member | REQ-026, REQ-027, REQ-030 |
| `DELETE /api/issues/{ID}` | | Creator or Admin | REQ-023 |
| `GET /api/my-issues` | The member's issues in active projects, grouped by status in order with empty groups left out, sorted by priority from Urgent down, then most recently updated. Done and Canceled hold only issues moved there in the last 14 days | Member | REQ-041, REQ-042 |

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
| `GET /api/notification-stats` | The status page's data. Counts and the recent list go by `state_changed_at`, and all windows use `now()`. A delivery's issue ID or project key comes from its batch's newest notification. A bounced delivery's attempts include the send that bounced. `workerStaleMinutes` is the whole minutes since the worker's last pass once that is 2 minutes or more (OPS-005), worked out with `now()`, else null. No emails and no excerpts | Admin | REQ-053, SEC-007 |

**Outside `/api`**

| Method and path | Notes | Spec |
|---|---|---|
| `GET /health` | `200` if `select 1` succeeds, otherwise `503` | OPS-005 |
| `GET /health/worker` | No session. `503` if the `worker` heartbeat is missing or its `last_pass_at` is older than `now() - interval '2 minutes'`, if any due pending delivery's `coalesce(next_attempt_at, send_after)` is older than `now() - interval '10 minutes'`, or if the database doesn't answer; otherwise `200`. The body is a short fixed word, never data about members or notifications | OPS-005 |
| `POST /webhooks/email` | Checks the provider's signature (`401` if it doesn't match). It skips the same-site check, since the provider is always cross-site, and marks emails `bounced` | API-003 |

### 3.5 Shared API types

Every response type, and the enum values both sides need, lives in `src/contract/`. It holds types and constant arrays only, so both the browser and the server can import it.
- **Three shapes, two boundaries.** Database rows (`*Row`, inferred from `schema.ts`) stay on the server. Contract types are what goes over the wire. Mapping functions in each context under `src/server/` (1.8) turn one into the other and declare the contract type as their return type, so a field added to a response by accident fails to compile. A mapper that builds rows with `.map` declares the row type on the callback too, since `.map` infers its element type and would skip the check.
- **Enums have one source.** `issueStatuses`, `issuePriorities`, `labelColors`, `roles` and `notificationChannels` are `as const` arrays in the contract; `schema.ts` builds its `pgEnum`s from them, so their order is still the sort order (2.1). The request schemas in each context's `schemas.ts` take their picklists from the same arrays (D-42). Client lists keyed by an enum use `satisfies Record<…>`, so a new value fails to compile until every list covers it, and pickers list values in the contract's order, which is also the order the spec names them in (REQ-017, REQ-018).
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

For `POST`, `PUT`, `PATCH` and `DELETE`, `apiRoute` requires:
- an `Origin` header equal to `APP_URL`'s origin;
- or, if `Origin` is missing, `Sec-Fetch-Site: same-origin`.

Anything else gets `403`. `SameSite=Lax` is a second layer of protection. Together they cover SEC-004 with no CSRF token stored in forms or state. The one exception is `/webhooks/email`, which is checked by signature instead (5.4).

### 4.5 Sign-in and reset limits (SEC-001)

**Sign-in** (`POST /api/sessions`), in order:
1. Lowercase and trim the email.
2. Count the last hour's `sign_in_attempts` rows for that email and for that IP. If there are 10 or more for the email, or 30 or more for the IP, answer `429`. This check comes **before** the password check, so a correct password is also refused (SEC-001.1).
3. Look up an active member by `lower(email)` and verify the password.
4. If either step fails, insert a `sign_in_attempts` row and answer `422` "Incorrect email or password.", not `401`, which the browser would treat as an ended session. Unknown and deactivated emails count the same way (SEC-001.3).
5. On success, create the session. Earlier failures stay counted until they're an hour old; a success doesn't reset them.

**Changing a password** (`PUT /api/me/password`) uses the same limits: a wrong current password inserts a `sign_in_attempts` row for the email and IP, and past either limit even the right one gets `429` (REQ-049.3).

**Reset request** (`POST /api/password-reset-links`): the same count against `password_reset_requests` (5 per email, 20 per IP), but **every** request is recorded, not just failures. The email is sent only if the address belongs to an active member.

**Details:**
- **IP address.** Taken from the rightmost `X-Forwarded-For` entry, which the reverse proxy sets (1.1). In development without a proxy, it falls back to `127.0.0.1`.
- **Races.** Two requests arriving at the same moment can both pass the count, so a limit can be exceeded by one. That's accepted rather than adding a lock.

### 4.6 Invitation and reset links

Accepting an invitation (`POST /api/members`) and resetting a password (`POST /api/password-resets`) each run in one transaction that **locks the link's row** (`for update`) before checking it, so two submits of the same link can't both succeed. The body schema has already checked the form (D-42), so a malformed form is refused before the link is looked at.
- **Which `410`.** A revoked invitation gets REQ-002.4's message; expired, accepted or unknown (including a link replaced by a resend) gets REQ-002.2's. A reset link that's used, expired or unknown, or whose member is deactivated, gets "This link has expired".
- **Signed in.** Accepting with a valid session gets `403` "You're signed in as {name}. Sign out to accept this invitation." The page shows that state before the form appears (REQ-002.3); the API check only stops a bypass. The reset page shows its own sign-out prompt and never looks at the token (REQ-050.8).

**Opening a link.** The invitation page calls `POST /api/invitation-lookups` with the token in the body as it opens, so it can show "expired" straight away (REQ-002.2) and greet the person by email. The reset page checks its token with `POST /api/password-reset-lookups` the same way, and shows the form only for a usable link (REQ-050.9). Neither lookup uses up the link, so a mail scanner opening it changes nothing (REQ-050.5).

### 4.7 Markdown (SEC-002, DATA-001)

One module, `src/lib/markdown/`, used for both **rendering** in the browser and **finding mentions** on the server. Because both use the same parser, `@sam` inside code is skipped the same way in both places (DATA-001.4).

- **Parser:** `remark-gfm` (checklists, tables, strikethrough) on `remark-parse`. `parse.ts` exports the remark plugins; the browser renders with `react-markdown` using them. On the server, `findMentions` runs the same plugins through `unified`, and `toPlainText` (for excerpts) joins the text of each block. `rehype-raw` is never used.
- **Raw HTML.** A small remark plugin turns every `html` node into a `text` node. `<script>` and `<img onerror>` then show as literal text (REQ-012.3, SEC-002.1), rather than depending on a library default.
- **Links.** A `urlTransform` allows only absolute `http:`, `https:` and `mailto:` URLs, for links and images. Any other link, relative ones included, renders as its plain text, not an `<a>` (SEC-002.2). Allowed links get `target="_blank" rel="noopener noreferrer"`.
- **Mentions.** A remark plugin walks text nodes (code has none, so it's skipped) and matches `(?<![A-Za-z0-9._%+@-])@([a-z0-9-]{2,20})(?![a-z0-9-])`. The look-behind skips email addresses and `foo@sam`; the look-ahead stops at punctuation, so `(@sam)` and `@sam, thanks` both match (DATA-001.5, DATA-001.6). Mentions are found in issue descriptions, project descriptions and comments.
  - On the server, the matches become the `mentions` rows: active members only (2.5).
  - In the browser, a match is shown highlighted, with the full name on hover, only if the username is in the `mentions` list the API returns with the text, so the browser never looks members up itself. Mentions aren't links (DATA-001).

### 4.8 Logs (SEC-007)

- The logger takes a fixed set of fields: time, level, event, method, path (without the query string), status, `durationMs`, `actor` (the member's username), and `error` (the error's class name only, since a message can quote request data; a failed query adds the database error's class and SQLSTATE code, such as `DrizzleQueryError (PostgresError 23505)`). The worker's lines (1.4) add `deliveryId`, `errorName` and the metrics counts; email-failure lines add the provider's `status` and `errorName`.
- It never logs request or response bodies, headers or cookies.
- Besides the request line, only email events, as short phrases such as `email bounced, invitation {id}`, and the worker's `notification` and `worker` lines (1.4) are logged.
- Errors from the email provider are logged without the message content.

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

In development `script-src` also gets `'unsafe-eval'`, which Next.js's dev tooling needs. Next.js reads the nonce from the request and adds it to its own scripts; the root layout awaits `connection()` so the shell is rendered per request. A nonce makes the shell render per request instead of being cached, which costs nothing here because there's one small shell.

**Access logs (SEC-007).** The reverse proxy's access log drops the `token` query parameter, so `/invite` and `/reset-password` addresses are logged without it.

### 4.10 Permissions (SEC-006, STD-2)

The route says who you are; the domain says what you may do (D-43). SEC-006's single server-side permission layer is the domain layer, so reading a domain file shows who may call each function.

- **Routes only authenticate.** `apiRoute`'s access mode is `"public"` or `"member"`. For `"member"`, `requireMember` (`401`) loads the member and passes it to the handler. No route checks a role.
- **`actor` first.** Every domain function called from a signed-in route takes the member as its first parameter, `actor`, including reads that don't use it yet (`_actor`). Public flows (sign-in, password reset, invitation lookup and acceptance, the email webhook), the worker, cleanup and helpers (log, tokens, email, limits) take no actor.
- **Admin checks.** `src/server/identity/sessions.ts` defines `type Admin = Member & { role: "admin" }` and `assertAdmin(member): asserts member is Admin`, which throws `403` "You don't have permission to do that." (STD-2). `identity`'s `index.ts` exports `assertAdmin`; `Admin` stays inside `identity`, since nothing outside it uses the type.
  - Admin-only functions call `assertAdmin(actor)` as their first statement: `createProject`, `deleteProject`, `updateMember`, `listInvitations`, `createInvitation`, `resendInvitation`, `revokeInvitation` and `notificationStats`.
  - Mixed functions check on the admin-only branch: `updateProject` for `name` and `archived`. `listMembers` never throws; it shapes the response by role (emails only for admins).
  - Ownership checks run once the row is loaded: `deleteIssue` (creator or admin), `editComment` (author only) and `deleteComment` (author or admin).
- **Order of checks:** cross-site (`403`), session (`401`), body schema (`422`), the domain's role check (`403`), lookups (`404`) and ownership (`403`), database rules, then the write. The role check comes before any lookup, so a member gets `403`, not `404`, for an admin-only action on a missing target, and learns nothing about whether it exists. A member's invalid body on an admin-only route gets `422`, not `403` (D-42).
- **Tests are the guard.** Nothing at typecheck makes an admin-only function call `assertAdmin`, so each one has a `403` test that calls the domain function directly with a plain member.
- **Logging.** Domain functions don't log; `apiRoute` names the actor by username (4.8). A username is none of the things SEC-007 forbids, and SEC-007.1 itself logs "member sam".

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

- **Templates.** One plain function per email type in `src/server/shared/email/templates.ts`. Each takes the snapshot (2.6) or the token and returns `{ subject, text }`. Tests check each one against the spec's wording.
- **Excerpts** are made with the shared Markdown module's text extraction (4.7), when the notification is created.
- **Comment links** end in `#comment-{id}`. The browser scrolls to that comment (section 6).

### 5.4 Bounce webhook (API-003)

`POST /webhooks/email`:
1. Read the **raw** body with `request.text()`, since the signature covers the exact bytes.
2. **Verify the signature** using `svix-id`, `svix-timestamp` and `svix-signature`:
   - compute HMAC-SHA256 of `{id}.{timestamp}.{body}` with the base64 secret from `RESEND_WEBHOOK_SECRET` (the part after `whsec_`);
   - accept if it matches any `v1,` signature in the header (constant-time compare) and the timestamp is within 5 minutes.

   Otherwise answer `401`. This is about 20 lines with `node:crypto`, with no `svix` dependency. Tests sign with a known secret.
3. Handle the event:
   - `email.bounced` → look up `provider_message_id`:
     - in `notification_deliveries` (channel `email`): set `bounced` and log `email bounced, notification {id}` with the delivery's id (REQ-045.6);
     - in `invitations`: set `bounced_at`, so the members page shows Bounced (REQ-051), and log `email bounced, invitation {id}`;
     - in neither (a reset email): log `email bounced, untracked`.
   - any other event type → ignore.
   - a body that isn't JSON, isn't an object, or is an `email.bounced` with no `data.email_id` → ignore and log `email event ignored`, without the body.
4. Answer `200` whenever the signature is valid, even for ignored events. Otherwise Resend keeps retrying.

### 5.5 Domain setup (one-time, before launch)

Mail is sent from a subdomain, so the app's sending reputation is kept apart from the team's normal email. The SPF, DKIM and DMARC records and the webhook registration are part of the deployment, outside this repository.

## 6. Screens

Behaviour and copy come from the spec; this section only adds the routes, layout and pages the spec doesn't describe. All components come from the Track Lite design system (`src/components/ui/track-lite/`). Complex widgets use React Aria Components; the kit's `Dialog` also takes `FocusScope` from the lower-level `react-aria` hooks package.

Every R1 screen was designed in one Claude Design project, `claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a`, read with the DesignSync tool. Each screen is a file in it: Signed-out screens, Profile, Accept invitation, Members, Project navigation, Project details, Labels, Issue page, Issue page - labels and description, Board, List, Comments, My issues and Notification status (each `<name>.dc.html`). A change to a screen starts from its file.

### 6.1 Routes

The routes are API-004's addresses (`src/client/routes.tsx`).
- `/forgot-password` sends a signed-in member to `/my-issues`, as `/sign-in` and `/` do (1.7).
- `/reset-password` and `/invite` show a signed-in member a sign-out prompt (REQ-050.8, REQ-002.3).
- `/project/{KEY}/settings`, `/settings/members` and `/settings/notifications` are admin-only.
- Any other address shows Not found (STD-4).

**Permissions.**
- A member who reaches an admin-only route sees "You don't have permission to do that." (STD-2) in the page area; the links to it are hidden.
- An unknown project key or issue ID shows Not found (STD-4).

**Addresses.**
- When an address uses lower case, such as `/issue/web-42`, the app rewrites it to the canonical form `/issue/WEB-42` with `replace` (REQ-016.5). Project addresses work the same way in `ProjectGate`: `/project/web/list?status=done` becomes `/project/WEB/list?status=done`, keeping the rest of the path, the query string and the hash.
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

- **Reset password:** the expired state has a **Request a new link** button that goes to `/forgot-password` (REQ-050.4).
- **Accept invitation:** the invited email is shown, not editable. The expired and revoked states show no form (REQ-002).
- **Profile:** full name with **Save**; username and email read-only; a separate **Change password** form.
- **Members** (admin): the invite field, then the invitations table, then the members table sorted by name. Each invitation row has **Resend** and **Revoke** buttons, and each member row's actions are in a **⋯** menu (REQ-051); Revoke and Deactivate ask for confirmation.
- **Notification status** (admin, REQ-053): the page title with **Refresh** beside it, then four sections. **Worker**: last seen, as a relative time (6.7), or "Never". **Queue**: pending, due and the oldest due wait. **Last 24 hours**: a table with one row per channel and the columns Sent, Dropped, Failed and Bounced. **Recent problems**: a table of Recipient (username), Channel, Issue or project, Attempts and When (6.7), with "No failed or bounced notifications." when empty. **Refresh** calls the RTK Query endpoint's `refetch` and is disabled while it runs; the endpoint is refetched on mount and never polled (1.7).
- **Project settings** (admin): name with **Save**, the key read-only, **Archive** / **Unarchive**, and **Delete** in a dialog whose button stays disabled until the key is typed exactly (REQ-014).
- **Archived projects:** each one opens its board, read-only.
- **List and My issues rows:** up to 2 labels, then "+N" (a board card shows 3, REQ-025).
- **New issue:** a dialog with only a title, opened from **New issue** or a column's **+** (REQ-029). On success it goes to the new issue's page (D-37).

### 6.4 Issue page

- **Header:** a link back to the project, the issue ID, and the title. The title is edited in place and saved on Enter or when focus leaves it. Escape cancels.
- **Main column:**
  - the description, shown formatted, with an **Edit** button that switches to a Markdown text area with **Save** and **Cancel** (STD-8 conflicts appear here);
  - the comments below it (REQ-032), then the comment box.
- **Side panel:** Status, Priority, Assignee and Labels pickers, each saving as soon as a value is chosen. A picker shows the new value once the server accepts it; on a failure it keeps the old value. Then "Created by {name}, {date}", and **Delete issue** for the creator or an admin. After a delete, the app goes to the project's board.
- **Mention suggestions (DATA-001):** typing `@` in the description editor or comment box opens a list of active members, filtered by username or name as the member types. Choosing one inserts `@username`.
- **Unsaved text (REQ-035):** a comment box holding text, or a description editor (issue or project) with unsaved changes, blocks in-app navigation with `useBlocker` and its REQ-035 message, and closing or reloading the tab with `beforeunload`.

### 6.5 Board details

- **Drag and drop:** React Aria Components' `GridList` with `useDragAndDrop`, one list per column, which allows reordering within a column and dropping into another. It comes with keyboard and screen-reader support for free, on top of the **⋯** menu that REQ-030 requires. The M5.1 spike confirmed it, including automatic scrolling near a column's edges (REQ-024); D-40 lists what the board must do to get there.
- **Each column scrolls on its own** (REQ-024.3), with the header and counts fixed.

### 6.6 Label colours

The spec's eight colours (REQ-021): `gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`. Each maps to a Track Lite colour token pair (background and text) that meets WCAG AA contrast (NFR-007). The tokens don't yet cover all eight hues, so until the kit adds the eight pairs, the Labels page (M3.7) draws every label as the neutral label pill with its colour name beside it. The name stays as a non-colour cue once the tokens exist. Labels created from the picker are `gray` (REQ-020). Deleting a label asks for confirmation, naming how many issues have it (REQ-021.5).

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
| D-9 | Separate worker process polling Postgres with `skip locked` (DEC-004) | A timer inside the Next.js server; pg-boss or similar | A web restart can't interrupt sends, there's no new dependency, and the queue is just a table. |
| D-10 | Strict single-page app: one HTML shell, all page data loaded through the API | Server-rendered pages | Owner's choice. Also gives one code path for permissions and tests. |
| D-26 | Nonce-based CSP set in `src/proxy.ts` (SEC-010) | A CSP without script rules | SEC-010 requires that only the app's own scripts run, and Next.js's inline scripts need a nonce for that. |
| D-27 | React Router (data mode) inside the shell | Next.js routing; hand-rolled `pushState` | One HTML document for every route, plus `useBlocker` for REQ-035. |
| D-32 | Resend (DEC-003) | Postmark, Amazon SES | Free plan fits NFR-009, signed webhooks, idempotency keys, simple domain setup. Postmark's paid plan (~$15) plus hosting goes over the $20 budget, and its webhooks aren't signed. SES is cheapest at volume, but its bounces come through SNS, which needs an AWS account and much more setup for 15 people. |
| D-34 | `fetch` + hand-written signature check | Resend SDK, `svix` package | Two small functions instead of two dependencies. |
| D-36 | React Aria `GridList` drag and drop | dnd-kit | Already in the stack, and accessible by keyboard and screen reader out of the box. Edge auto-scroll confirmed by the M5.1 spike (D-40). |
| D-37 | New issue: title-only dialog, then go to the issue | A full create form | Matches REQ-016's flow ("enters a title"); everything else is edited on the issue page. |
| D-39 | Track Lite design system, ported from its Claude Design project into `src/components/ui/track-lite/` | Hairline; a component library from npm | Made for this product. Fonts load through `next/font` and icons through `@phosphor-icons/react` instead of the project's CDN links, which the CSP (D-26) would block. |
| D-40 | Keep D-36 with no fallback, after the M5.1 spike. Each column's `GridList` is the scroll box, with `position: relative` (virtualized with `Virtualizer` and `ListLayout` since M11.2b, so only the cards in view render); each card has a `<Button slot="drag">` | Writing our own edge auto-scroll; a separate drag library | Mouse drags across 5 columns, into an empty column (`onRootDrop`) and within a column (`onReorder`) all landed in the right place. Near a column's edge, the browser scrolls it natively, or React Aria's `useAutoScroll` does in Safari. Keyboard drags (Enter on the drag button, Tab between columns, arrows, Enter) work and are announced. Without `position: relative` on the scroll box, the hidden keyboard drop targets scroll the whole page instead of the column. Without the drag button, cards that open the issue on click can only be dragged with Alt+Enter. |
| D-42 | Valibot body schemas declared per route and run by `apiRoute`; schemas live in `src/server/<context>/schemas.ts` (one per context, server-only; shared helpers in `src/server/shared/schemas.ts`), and the domain function takes their typed output | Hand-written `typeof` checks in each domain function; Zod; parsing at the start of each domain function; each schema in the domain module that uses it | One path turns invalid input into STD-3's `422`, domain functions get typed and already-trimmed input instead of `unknown`, and a malformed body stops being a `500`. The order of checks is in 4.10. A signed-out caller always gets `401` and learns nothing about the body; invalid input fails before the role check and any domain query. A signed-in member without the role who sends an invalid body therefore gets `422`, not `403`; the schema reveals only the request's shape, which the browser code already shows. Lengths count characters (code points) as the spec and Postgres do, not UTF-16 units. One `schemas.ts` per context puts that context's input rules in one place to read and review, and keeps them apart from its database code. |
| D-43 | Routes only authenticate. Every domain function called from a signed-in route takes the member as `actor` first and owns every role and ownership check, with `assertAdmin` before any lookup (4.10) | `apiRoute("admin")` checking the role in the route; admin-only functions typed `actor: Admin`; an `adminOnly` wrapper | Reading a domain file must show its permission rules: with the role in the route, `createProject` looked open to anyone while `updateProject` checked. Typing `actor: Admin` would push the narrowing back into the route. A wrapper adds an abstraction for a one-line check. |
| D-44 | Response types and enum values in a shared `src/contract/`; mapping functions in each context under `src/server/` (1.8) return them | Types owned by the client and checked with `satisfies` in each route; one model shared by database, domain and API | A declared return type catches extra fields, which `satisfies` on a function call can't. One enum source keeps client lists complete. Rows and responses really differ (uuid vs `WEB-42`, `Date` vs ISO string, internal columns), so they stay separate types with a mapping between them. |
| D-45 | Notifications in batches with one delivery per channel; senders in `src/server/notifications/notification-channels/`, mapped by the `notification_channel` enum | One `notification_emails` table; one deliveries table with the notification rows copied per channel | Keeps notifications independent of email so a channel (SMS) can be added with a new sender, an enum value and a profile setting. Batching and drop checks stay shared; state and retries are per channel, so one channel failing doesn't touch another. |
| D-46 | The worker claims deliveries with a 2-minute lease (`locked_until`) in a short transaction, then sends outside any transaction and records the result only if the lease is still its own (1.4) | Holding the row lock in one transaction for the whole pass, so "locked" meant "being sent"; a `sending` state | A pass held a transaction and a pooled connection open across up to 10 provider calls, and one bad row rolled back the whole pass and crash-looped the worker. A `sending` state would need its own recovery and would leak into the webhook, cleanup and stats. |
