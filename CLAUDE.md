# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project state

Tracklite is a small issue tracker for one invite-only team. It is being **rebuilt from the docs**, one task at a time. Most of the architecture below is planned, not built yet; check `docs/build-plan.md` to see which tasks are ticked before assuming something exists.

- `docs/tracklite-spec.md`: what the product does. Rules are IDs such as `REQ-047`, `SEC-004`, `STD-5`, each with numbered examples (`REQ-047.2`). **The spec wins** over the design. If the spec is wrong or silent, fix the spec first (with a changelog line), then the code.
- `docs/tech-design.md`: technical decisions, cited as `§1.7`, `§3.3` and so on.
- `docs/build-plan.md`: milestones M0–M11 split into tasks (`M1.3`).

Look rules up by grep rather than reading whole docs: `grep -n "REQ-047" docs/tracklite-spec.md`.

## Working a build-plan task

A prompt like "Do task M1.3 from docs/build-plan.md" means following the **Working a task** section of the build plan exactly. In short:
- Read only the ground rules, that section, the task entry, and what its **Reads** lists.
- Stop if any task in **Needs** isn't ticked. Tasks listed after "API description:" are the exception.
- Write the **Done** tests first. Name each test after its example, e.g. `it("REQ-016.4: concurrent creates get distinct numbers")`.
- Stop when Done passes and `npm test`, `npm run lint` and `npm run typecheck` are green. Don't start the next task.
- Tick the box and commit as `M1.3: <task title>`.
- If a task is too big, split it in the plan (M1.3a, M1.3b) and do only the first part.

## Commands

Node ≥ 24. Tests and migrations need a local PostgreSQL. Copy `.env.example` to `.env.local`.

```bash
npm run dev            # next dev
npm test               # vitest run (all projects)
npm run lint           # biome check  (auto-fix: npx biome check --write)
npm run typecheck      # next typegen && tsc --noEmit
npm run db:generate    # drizzle-kit: write a migration from src/server/schema.ts
npm run db:studio
```

Run one test file, one named test, or one project:

```bash
npx vitest run src/server/schema.test.ts
npx vitest run -t "REQ-016.4"
npx vitest run --project unit
```

Test setup (`vitest.config.ts`):
- Two projects. `unit` runs `src/**/*.test.ts` in node with no file parallelism, because the tests share one database. `components` runs `src/**/*.test.tsx` in jsdom.
- Under vitest, `DATABASE_URL` is replaced by `TEST_DATABASE_URL` from `.env.local`.
- `server-only` is aliased to a no-op so server modules can be imported in tests.

Always run drizzle-kit through the npm scripts. They set `NODE_OPTIONS=--conditions=react-server`, which `server-only` imports need. Never hand-edit `migrations/meta/`.

## Architecture (as designed in docs/tech-design.md)

**Processes (§1.1).** `tracklite-web` is `next start` behind Caddy. `tracklite-worker` is a Node entry point in `scripts/`, built from the same codebase. Both use PostgreSQL 18 and nothing else; there is no Redis and no paid queue.

**Strict single-page app (§1.7).** Every page address serves the same HTML shell. `src/app/[[...path]]/page.tsx` renders `<ClientApp />` with `next/dynamic` and `ssr: false`. The browser does all of these:
- routing, with React Router in data mode and lazy routes;
- signed-out redirects (`GET /api/me`, then `/sign-in?next=…`);
- all data loading, through `/api`.

There is no server-side data fetching in pages. `/api`, `/health` and `/webhooks` are more specific routes, so the catch-all never handles them. `src/proxy.ts` only sets the nonce-based CSP.

**Client state (§1.7).** Redux Toolkit:
- RTK Query holds all server data, in one `api` slice with a shared `baseQuery` that redirects on `401`.
- Refreshing is driven by tags and `refetchOnMountOrArgChange`. There is no polling and no refetch on focus.
- Board moves are optimistic.
- The only UI slice is `toast`.
- List filters, search and sort live in the URL. Form drafts live in component state.

**API request flow (§1.2).** Every handler is wrapped in `apiRoute`, which in order:
1. rejects cross-site writes with `403`;
2. runs `requireMember`, then `requireAdmin` where needed. This is the only permission layer;
3. calls one domain function in `src/server/` inside a transaction, so the action and its notification rows commit together;
4. maps a thrown `ApiError` to `{ error: { message, fields? } }` with 401/403/404/422/429/503, and anything else to 500;
5. writes one JSON log line, with no bodies, tokens or query strings.

The browser shows `message` as-is, so all user-facing copy for server outcomes lives on the server.

**API conventions (§3.1).**
- Issues are addressed by ID (`WEB-42`), projects by key, members by username, all matched ignoring case.
- Issue edits are per-field `PATCH`es.
- Creates carry a `requestId`. A repeat returns the original with `200` (STD-5).
- Tokens never go in paths.
- A member in a response is `{ username, fullName, initials, deactivated }`.

**Page and API task pairs.** A page task writes its own RTK Query endpoints, typed from §3.3, and tests against mocks. Whichever task merges second wires them up and makes each handler's return value `satisfies` the page's response type.

**Time (§1.3).** Every expiry and time-window check uses the database's `now()` inside SQL, never the app clock. Tests move stored timestamps into the past (`expires_at = now() - interval '1 minute'`). They never fake the clock.

**Email (§1.5, §1.4).**
- Invitations and password resets are sent synchronously inside the request transaction. If the send fails, the transaction rolls back and the API answers `503`.
- Notification emails are queued in the `notification_emails` table. The worker polls it every 5 s with `for update skip locked` and uses the row id as Resend's `Idempotency-Key`.
- All mail goes through one `sendEmail()` with three backends: Resend in production, Mailpit (`:8025`) in development, and an in-memory outbox in tests.

**Schema (§2, `src/server/schema.ts`).**
- Drizzle ORM over postgres.js.
- Enum declaration order is the sort order (status and priority), so changing the order changes the UI ordering.
- Every timestamp is `timestamptz`.
- Tokens are stored as sha256 `bytea` hashes.

**UI.** Use the Track Lite design system in `src/components/ui/track-lite/` (import from its `index.ts`). Components are styled by plain `tl-*` classes in `styles/components.css` and tokens (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`) in `styles/`. `src/app/layout.tsx` loads that stylesheet and the fonts. Read `docs/design-system.md` before building a screen: it covers voice, colour roles, sizes and icons. Icons come from `@phosphor-icons/react` (duotone weight, 15px by default). Never load fonts, icons or styles from a CDN, because the CSP allows only `'self'`. Use `react-aria-components` for complex widgets the kit doesn't cover, such as board drag and drop (D-36).

## Coding rules

- **No comments in code under `src/`.** That includes line comments, block comments and JSDoc. Say what the code means through names, types and test titles; spec IDs belong in test names, not comments.
- **Component-driven development first.** Build UI from the bottom up. Each element starts as an isolated component that holds no app state and gets its data and callbacks through props. Develop it on its own in the design sandbox, then compose it into larger layouts and finally connect it to the store and the router.
- **Test-driven development.** Write a failing automated test first and watch it fail. Then write the minimum code that makes it pass, and refactor while the tests stay green.
- **No dead or unused code.** Delete unused exports, files, branches and parameters, and don't add code for later. The exception is prebuilt UI components, which may sit unused.

## Code style

Biome formats with 2-space indent, 110-column lines, `bracketSameLine` and **no trailing newline**. The TypeScript config uses `verbatimModuleSyntax` and `erasableSyntaxOnly`: use `import type` for types, and don't use enums, namespaces or parameter properties.
