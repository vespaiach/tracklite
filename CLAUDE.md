# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project state

Tracklite is a small issue tracker for one invite-only team. It is being **rebuilt from the docs**, one task at a time. Most of R1 is built, but not all of it. Done tasks are removed from `docs/execution-plan.md`, so anything still listed there may not exist yet.

- `docs/tracklite-spec.md`: what the product does. Rules are IDs such as `REQ-047`, `SEC-004`, `STD-5`, each with numbered examples (`REQ-047.2`). **The spec wins** over the design. If the spec is wrong or silent, fix the spec first (with a changelog line), then the code.
- `docs/tech-design.md`: technical decisions, cited as `§1.7`, `§3.3` and so on.
- `docs/execution-plan.md`: the backlog of open tasks (`D01`), in run order.

Look rules up by grep rather than reading whole docs: `grep -n "REQ-047" docs/tracklite-spec.md`.

## Working a task

Tasks are rows of `docs/execution-plan.md`; follow its **Status tracking** rules. Name each test after the spec example it proves, e.g. `it("REQ-016.4: concurrent creates get distinct numbers")`.

## Commands

Node ≥ 24. Tests and migrations need a local PostgreSQL. Copy `.env.example` to `.env.local`.

```bash
npm run dev            # next dev
npm test               # vitest run (all projects)
npm run lint           # biome check  (auto-fix: npx biome check --write)
npm run typecheck      # next typegen && tsc --noEmit
npm run db:generate    # drizzle-kit: write a migration from infrastructure/schema.ts and infrastructure/<context>/tables.ts
npm run db:migrate     # apply migrations to DATABASE_URL
npm run db:studio
npm run db:seed        # dev members and admins (password in src/infrastructure/identity/seed.ts)
npm run db:seed:load   # NFR-001 load data: 50 projects, 10,000 issues, 50,000 comments
npm run db:reset       # drop the local dev database's schemas, re-run migrations, then db:seed
npm run cron           # call POST /api/cron/outbox every minute (the outbox run)
npm run email:dev      # send one sample email to Mailpit
```

Run one test file, one named test, or one project:

```bash
npx vitest run src/infrastructure/schema.test.ts
npx vitest run -t "REQ-016.4"
npx vitest run --project unit
```

Test setup (`vitest.config.ts`):
- Two projects. `unit` runs `src/**/*.test.ts` in node with no file parallelism, because the tests share one database. `components` runs `src/**/*.test.tsx` in jsdom.
- Under vitest, `DATABASE_URL` is replaced by `TEST_DATABASE_URL` from `.env.local`.
- `server-only` is aliased to a no-op so server modules can be imported in tests.
- In `unit`, `src/test/next-mocks.ts` mocks `next/headers`, `next/cache` and `next/navigation`; set the request's cookies and headers with `setNextRequest` from `src/test/next-request.ts`.

Always run drizzle-kit through the npm scripts. They set `NODE_OPTIONS=--conditions=react-server`, which `server-only` imports need. Never hand-edit `migrations/meta/`.

## Architecture (as designed in docs/tech-design.md)

**Processes (§1.1).** `tracklite-web` is `next start` behind a reverse proxy. Deployment (servers, proxy, deploys, backups) is maintained outside this repository. There is no worker process: a scheduler calls `POST /api/cron/outbox` every minute with `Authorization: Bearer {CRON_SECRET}` (§1.4). The app uses PostgreSQL 18 and nothing else; there is no Redis and no paid queue.

**Strict single-page app (§1.7).** Every page address not yet moved to the server serves the same HTML shell. `src/app/(signed-in)/[...path]/page.tsx` renders `<ClientApp />` through `src/client/ClientPage.tsx` with `next/dynamic` and `ssr: false`. The browser does all of these:
- routing, with React Router in data mode and lazy routes;
- signed-out redirects (`GET /api/me`, then `/sign-in?next=…`);
- all data loading, through `/api`.

There is no server-side data fetching in pages. `/api`, `/health` and `/webhooks` are more specific routes, so the catch-all never handles them. `src/proxy.ts` only sets the nonce-based CSP and `Referrer-Policy`, and forwards the requested path in `x-request-path`. The `(signed-in)` layout redirects a signed-out visitor to `/sign-in?next=…` on the server; server actions are wrapped by `action()` in `src/app/_server/action.ts` (tech design §1.2). The signed-out pages (`/sign-in`, `/forgot-password`, `/reset-password`, `/invite`, `/welcome`) are server pages in `src/app/(signed-out)/`, each with an `actions.ts` and a client form built on `useFormAction` (`src/components/useFormAction.ts`); the single-page app reaches them, and a `401`, with a full page load (`src/lib/load-page.ts`). Since H14 the `(signed-in)` layout renders the shell and sidebar on the server (`src/app/(signed-in)/Shell.tsx`, sidebar projects in a `Region`, **New project** and **Sign out** as actions), and `/my-issues` is a server page. Since H15 `/project/[key]/layout.tsx` resolves the project (`notFound()`, canonical-key redirect) and renders the project header with **New issue**, and the board is a server page whose moves call the `moveIssue` action through `useOptimistic`; pages call `signedInPageMember()` themselves, since a layout and its page render in parallel. Links between the server pages and the single-page app load a new document, and the single-page app calls `router.refresh()` (`refreshServer` in its store) after a project change so the sidebar is read again.

**Client state (§1.7).** Redux Toolkit:
- RTK Query holds all server data, in one `api` slice with a shared `baseQuery` that redirects on `401`.
- Board moves are optimistic on the server-rendered board (`useOptimistic`), not in RTK Query.
- Board moves are optimistic.
- The only UI slice is `toast`.
- List filters, search and sort live in the URL. Form drafts live in component state.

**Server actions and API request flow (§1.2).** Pages change data through server actions: each route's `actions.ts` wraps its functions in `action()` (`src/app/_server/action.ts`, D-63), which reads the session, parses the input with Valibot, runs one use case, refreshes, and returns `{ ok: true, data }` or `{ ok: false, error: { kind, message, fields? } }`. Until H20 the remaining `/api` handlers are wrapped in `apiRoute` (`src/app/api/_route.ts`), which in order:
1. rejects cross-site writes with `403`;
2. runs `requireMember`, which only authenticates (`401`). Routes never check roles. A route declared `"public"` (sign-in, password resets, invitation lookups and acceptance, sign-out) skips this step;
3. parses the JSON body against the route's Valibot schema from `src/app/_server/schemas/<context>.ts`, if it declares one, and fails fast with `422` (D-42). Schemas check shape and format only;
4. calls one use case from `src/application/<context>/` with the member as its first argument, `actor`, and the context's wired unit of work (`issueWork`, `projectWork`, `commentWork`), then reads its response through `src/queries/`. `apiRoute` opens no transaction; the unit of work does. The use case and its entities are the only permission layer (D-43): admin-only use cases call `assertAdmin(actor)` before any lookup, and ownership checks run once the row is loaded;
5. maps a thrown `DomainError` by its kind (§3.2) to `{ error: { message, fields? } }` with 401/403/404/409/410/422/429/503, and anything else to 500;
6. writes one JSON log line, with no bodies, tokens or query strings. A signed-in request names its `actor` by username.

The browser shows `message` as-is, so all user-facing copy for server outcomes lives on the server.

**Layers (§1.8, D-60).** The server code is split into four layers, with one folder per context (`identity`, `projects`, `issues`, `comments`, `notifications`) inside each, plus `shared/`:
- `src/domain/<context>/`: entities (`create`/`rehydrate`), value objects (`from`), repository interfaces and domain events; `DomainError`, `AggregateRoot` and the identifiers (`IssueId`, `ProjectKey`, `Username`, `RequestId`, `Uuid`) are in `domain/shared/`. No `next/*`, Drizzle or `server-only`.
- `src/application/<context>/`: one file per use case, taking `actor` first, then a `UnitOfWork` (`application/shared/unit-of-work.ts`), then the parsed input.
- `src/infrastructure/`: db, transaction, schema, config, log, email, tokens, passwords, the unit of work and, per context, `tables.ts`, mappers and Drizzle repositories.
- `src/queries/`: read-only SQL behind pages and the responses commands return (D-57, D-64), returning `src/contract/` types.
- `src/app/`: pages, `actions.ts`, route handlers and their input schemas (`_server/schemas/`); the actions are the composition root that wires infrastructure into use cases.

`src/architecture.test.ts` checks the layer imports (`domain/**` imports only `domain/**`, `src/contract`, `valibot` and `fractional-indexing`; `application/**` only `domain/**`, `application/**` and `src/contract`; `queries/**` only `domain/**`, `infrastructure/**/tables.ts`, `infrastructure/db`, `infrastructure/transaction`, `src/contract` and packages other than `next/*`), the context map and table ownership:
- Allowed dependencies: `comments` → `issues`, `projects`; `issues` → `projects`; `notifications` → `comments`, `issues`, `projects`; every context → `identity`, `shared`. No other context imports `notifications`; only `infrastructure/unit-of-work.ts` reaches it, through the outbox writer (`infrastructure/notifications/outbox-writer.ts`). No cycles. Within a layer, a context imports another context's files directly.
- Each context owns its tables (§1.8 table): only its infrastructure inserts, updates or deletes them (M16); others may read them in joins, and `queries/` reads any of them.
- Tests sit next to their source. Decisions that need no database are entity methods (load → decide → write). Use the §1.8 glossary's terms in code.

**Outbox (§1.4, D-62).** Entities record domain events; before commit the unit of work hands them to the outbox writer, which mirrors mentions and writes one `outbox_events` row per event (recipients and snapshot included) in the action's transaction. `POST /api/cron/outbox` turns them into notifications and deliveries (see Email below).

**API conventions (§3.1).**
- Issues are addressed by ID (`WEB-42`), projects by key, members by username, all matched ignoring case.
- Issue edits are per-field `PATCH`es.
- Creates carry a `requestId`. A repeat returns the original with `200` (STD-5).
- Tokens never go in paths.
- A member in a response is `{ username, fullName, initials, deactivated }`.

**Page and API task pairs.** A page task writes its response types into `src/contract/` (§3.5) and its own RTK Query endpoints, typed from the shapes §3.3 holds for endpoints not wired yet, and tests against mocks. Whichever task merges second wires them up: the domain function returns the contract type (a route's `satisfies` is optional), and those shapes are removed from §3.3. Wired-up shapes live only in the code: request bodies in `src/app/_server/schemas/<context>.ts`, responses in `src/contract/`.

**Time (§1.3).** Every expiry and time-window check uses the database's `now()` inside SQL, never the app clock. Tests move stored timestamps into the past (`expires_at = now() - interval '1 minute'`). They never fake the clock.

**Email (§1.5, §1.4).**
- Invitations and password resets are sent synchronously inside the request transaction. If the send fails, the transaction rolls back and the API answers `503`.
- Notifications are grouped in `notification_batches`, with one `notification_deliveries` row per channel the recipient chose (only `email` in R1). Each outbox run (`src/app/api/cron/outbox/route.ts`, `infrastructure/notifications/run-outbox.ts`, at most 50 s) records the heartbeat in `job_runs`, turns due `outbox_events` into notifications (`record-notifications`, idempotent through `notifications (event_id, recipient_id)`), claims deliveries with `for update skip locked`, hands them to the channel's sender in `src/infrastructure/notifications/channels/`, and uses the delivery id as Resend's `Idempotency-Key`.
- All mail goes through one `sendEmail()` with three backends: Resend in production, Mailpit (`:8025`) in development, and an in-memory outbox in tests.

**Schema (§2, `src/infrastructure/schema.ts` and each context's `src/infrastructure/<context>/tables.ts`).**
- Drizzle ORM over postgres.js.
- Enum declaration order is the sort order (status and priority), so changing the order changes the UI ordering.
- Every timestamp is `timestamptz`.
- Tokens are stored as sha256 `bytea` hashes.

**UI.** Use the Track Lite design system in `src/components/ui/track-lite/` (import from its `index.ts`). It follows the **Docket** design system in the export in `docs/design/` (`_ds/docket-design-system-…/` and `tracklite-app.css`). Components are styled by plain `tl-*` classes in its `styles/components.css` and Docket tokens (`--canvas`, `--surface-*`, `--ink-*`, `--hairline-*`, `--primary-*`, `--danger`, `--status-*`, `--space-*`, `--radius-*`, `--elev-*`) in its `styles/`; build from kit classes and tokens, never from the design's inline styles. `src/app/layout.tsx` loads that stylesheet and the Geist and Geist Mono fonts. Read `docs/design-system.md` before building a screen: it covers voice, colour roles, sizes and icons. Icons come from `lucide-react` (14–16px, 1.75 stroke). Never load fonts, icons or styles from a CDN, because the CSP allows only `'self'`. Use `react-aria-components` for complex widgets the kit doesn't cover, such as board drag and drop (D-36).

## Coding rules

- **No comments in code under `src/`.** That includes line comments, block comments and JSDoc. Say what the code means through names, types and test titles; spec IDs belong in test names, not comments.
- **Domain functions take `actor` first and own every role and ownership check; routes never check roles.** An admin-only function's first statement is `assertAdmin(actor)`, and each one has a 403 test that calls it directly. Reading a domain file must show who may call it (`docs/tech-design.md` §4.10).
- **Component-driven development first.** Build UI from the bottom up. Each element starts as an isolated component that holds no app state and gets its data and callbacks through props. Develop it on its own in the design sandbox, then compose it into larger layouts and finally connect it to the store and the router.
- **Test-driven development.** Write a failing test first, run it to confirm it fails for the expected reason, then write the minimum code to make it pass, then refactor with the tests green. Two owner checkpoints apply in every coding session:
   - **Before writing tests**, list the test cases you plan to write (name, what it asserts, which R-ID it closes) and ask the owner whether to add or change any. Do not write test code until the owner confirms the list.
   - **After writing the tests** (and confirming they fail for the expected reason), stop and wait for the owner to review and approve them. Do not write implementation code until the owner approves.
- **Test each rule once, at the layer that owns it.** Before adding a test, check whether another test already covers the behaviour; if one does, extend it instead.
   - A route test covers only that route's own rules. `api-route.test.ts` alone covers what `apiRoute` does: the signed-out 401, the 422 for a body that isn't JSON, and the cross-site 403.
   - A permission rule is tested once, by calling the domain function directly (the 403 test above). Routes don't repeat it.
   - Write one test per code path, not one per message or input. Several server messages that reach the same branch, or several invalid inputs to one schema, go in one test that checks each in turn and whose name lists every example ID it covers.
   - Shared client code (loading and load-failure states, toasts, `DescriptionEditor`) is tested in its own test or in one representative screen, not again on every screen. Each design-system component keeps at least one test of its own, of behaviour we add (focus return, default `type="button"`), not react-aria's.
   - Don't test a library's own behaviour (react-aria, Valibot, Drizzle) or the test helpers.
- **No dead or unused code.** Delete unused feature files, unreachable branches, and abandoned logic. Structural abstractions (e.g., React context providers, middleware boilerplate, base interfaces) and prebuilt UI components are exempt and may include full API signatures, exports, or default handlers required for architectural completeness.
- **Write function bodies as short, named steps.** Split a function into steps, such as guard checks, each query or write, and building the result. Put one blank line between steps and none inside a statement or chain. If a step has a clear name, needs only one or two inputs and hides detail the caller doesn't need, move it into a function with that name, even if it is used once. If you can't name a step, or extracting it would need many parameters, leave it as a blank-line group. A function with one or two steps stays as one block. There are no comments under `src/`, so blank lines and function names are how the code shows its steps.
- **Run the code checks after implementing.** When a task's implementation is done, run these in order and fix any failure before moving on: `npm run typecheck`, `npm run lint`, `npm test`.
- **Commit, push and open a PR when done.** Once the implementation is done and every check in *Run the code checks* passes, commit, push the branch and open a PR without waiting to be asked.
- **Before opening a PR, run all three and make sure they pass.** GitHub CI is temporarily turned off (`.github/workflows/ci.yml` runs only on manual dispatch), so nothing else checks the branch. Run `npm run lint`, `npm run typecheck` and `npm test`, and do not open the PR until all three are green.

## Code style

Biome formats with 2-space indent, 110-column lines, `bracketSameLine` and **no trailing newline**. The TypeScript config uses `verbatimModuleSyntax` and `erasableSyntaxOnly`: use `import type` for types, and don't use enums, namespaces or parameter properties.
