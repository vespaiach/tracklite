# Tracklite

A small, self-hosted issue tracker for one invite-only team. It covers filing issues, moving them across a board and discussing them in comments, and leaves out cycles, roadmaps, integrations and custom workflows.

- **Projects** with a key (`WEB`), a Markdown description and labels.
- **Issues** numbered per project (`WEB-42`), with a fixed set of statuses and priorities, an assignee and up to 10 labels.
- **Board view** with drag and drop (mouse and keyboard), and a **list view** with search, filters and sort kept in the URL.
- **Comments** with `@mentions`, on issues and on projects.
- **My issues**, the landing page after sign-in.
- **Email notifications** for assignments and mentions.
- **Invitation-only accounts** with member and admin roles. No public sign-up, no SSO.

The app needs PostgreSQL and nothing else: no Redis, no paid queue, no third-party services except an email provider.

The full scope, including what is deliberately left out, is in the [spec](docs/tracklite-spec.md).

## How the project is built

Tracklite is being rebuilt from its documents, one task at a time:

| Document | What it holds |
|---|---|
| [docs/tracklite-spec.md](docs/tracklite-spec.md) | What the product does. Rules have IDs such as `REQ-047`, `SEC-004`, `STD-5`, each with numbered examples (`REQ-047.2`). The spec wins over everything else. |
| [docs/tech-design.md](docs/tech-design.md) | Technical decisions, cited by section (`§1.7`) and decision ID (`D-36`). |
| [docs/execution-plan.md](docs/execution-plan.md) | The backlog of open tasks in run order, each with its dependencies and what must pass. Done tasks are removed. |
| [docs/design-system.md](docs/design-system.md) | Voice, colour roles, sizes and icons for the Track Lite UI kit. |

Tests are named after the spec example they prove, e.g. `it("REQ-016.4: concurrent creates get distinct numbers")`, so `grep -rn REQ-016 src` shows how a rule is covered.

## Architecture

```
 browser ──HTTPS──▶ reverse proxy ──▶ tracklite-web (next start) ──▶ PostgreSQL 18
                         ▲                     │
 scheduler ──POST /api/cron/outbox,            ▼
             every minute                Resend (email API)
```

- **The reverse proxy** is part of the deployment, which lives outside this repository. It terminates TLS, sends HSTS and the security headers, sets `X-Forwarded-For`, and proxies to the web process.
- **tracklite-web** is `next start`, the only app process. It serves the single-page-app shell, the JSON API under `/api`, the outbox run at `/api/cron/outbox`, `/health`, `/health/worker` and the email bounce webhook under `/webhooks`.
- **The scheduler** (any cron-like service, part of the deployment) calls `POST /api/cron/outbox` once a minute with `Authorization: Bearer {CRON_SECRET}`. Each run, within 50 seconds, turns the events that actions wrote to the outbox into notifications, sends the due notification emails using `for update skip locked`, and once an hour deletes expired data.
- **PostgreSQL 18** holds all state, including the outbox and the notification email queue.

### Browser app

The signed-out pages (`/sign-in`, `/forgot-password`, `/reset-password`, `/invite`, `/welcome`) render on the server from `src/app/(signed-out)/` and post their forms to server actions. Signed-in pages sit in `src/app/(signed-in)/`, under a layout that sends a signed-out visitor to `/sign-in?next=…` and renders the shell and sidebar on the server. `/my-issues`, the settings pages (`/settings/profile`, `/settings/members`, `/settings/notifications`), the project board, labels and settings (`/project/{KEY}`, `/project/{KEY}/labels`, `/project/{KEY}/settings`, under a project layout that renders the project header) and `/projects/archived` are server pages; every other address (`src/app/(signed-in)/[...path]/page.tsx`) loads `<ClientApp />` in the browser only. From there:

- **React Router** (data mode, lazy routes) does the routing; a `401` loads `/sign-in?next=…` as a new page.
- **RTK Query** holds all server data and loads it through `/api`. Screens refetch when opened; there is no polling.
- **Redux** has one UI slice, for toasts. List filters live in the URL and form drafts in component state.

There is no server-side data fetching in pages, so every read and write passes through the same API and the same permission checks.

### API

Each remaining `/api` route handler is wrapped in `apiRoute` ([src/app/api/_route.ts](src/app/api/_route.ts)), which:

1. rejects cross-site writes with `403`;
2. authenticates the session (`401`), unless the route is public;
3. validates the JSON body against a Valibot schema from `src/app/_server/schemas/<context>.ts` (`422`);
4. calls one use case in `src/application/`, passing the signed-in member as `actor`;
5. maps a thrown `DomainError` by its kind to `{ error: { message, fields? } }`;
6. writes one JSON log line, without bodies or tokens.

Routes never check roles. The use cases and entities are the only permission layer: admin-only use cases start with `assertAdmin(actor)`, and ownership checks run once the row is loaded (`docs/tech-design.md` §4.10). Each use case runs in one unit of work, so an action and the outbox events it records commit together.

Every expiry and time-window check uses the database's `now()`, never the app server's clock.

### Source layout

```
src/
  app/            Next.js routes: pages, actions, /api, /health, /webhooks
  client/         the browser app: store, API slice, routes, screens
  components/ui/  the Track Lite design system
  domain/         entities, value objects, repository interfaces, events
  application/    use cases
  infrastructure/ database, tables, repositories, outbox, email
  queries/        read-only SQL behind pages
  lib/markdown/   Markdown rendering and mention parsing
  test/           test harness and data factories
scripts/          cron, migrations and seed commands
migrations/       drizzle-kit migrations
```

## Stack

| Area | Choice |
|---|---|
| Runtime | Node.js ≥ 24, TypeScript |
| Web framework | Next.js 16 (App Router, used as an SPA host and API server) |
| UI | React 19, React Router, Redux Toolkit and RTK Query, React Aria Components, Lucide icons (`lucide-react`), Tailwind CSS 4 with the Track Lite `tl-*` classes and tokens |
| Validation | Valibot |
| Database | PostgreSQL 18, Drizzle ORM over postgres.js, drizzle-kit migrations, `pg_trgm` for search |
| Auth | Argon2id passwords (`@node-rs/argon2`), session cookies, tokens stored as sha256 hashes |
| Email | Resend in production, Mailpit in development, an in-memory outbox in tests |
| Markdown | react-markdown, remark-gfm, unified |
| Testing | Vitest (node and jsdom projects), Testing Library |
| Lint and format | Biome |

## Development

### Requirements

- Node.js 24 or later
- A local PostgreSQL 18 with two databases, one for development and one for tests
- [Mailpit](https://mailpit.axllent.org/) on port 8025, to see emails sent in development

### Set up

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `DATABASE_URL` and `TEST_DATABASE_URL` in `.env.local`. They must point at different databases, because the test database is dropped and re-migrated on every run. Then create the schema and the dev accounts:

```bash
npm run db:reset
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in as one of the seeded members (the password is in `src/infrastructure/identity/seed.ts`). To send notification emails, call the outbox run every minute from a second terminal (it uses `APP_URL` and `CRON_SECRET` from `.env.local`):

```bash
npm run cron
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run cron` | Call `POST /api/cron/outbox` every minute, as the scheduler does in production |
| `npm test` | Run every test (needs `TEST_DATABASE_URL`) |
| `npm run lint` | Biome check (`npx biome check --write` to fix) |
| `npm run typecheck` | `next typegen` and `tsc --noEmit` |
| `npm run db:generate` | Write a migration from `src/infrastructure/schema.ts` and each context's `src/infrastructure/<context>/tables.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Add dev members and admins |
| `npm run db:seed:load` | Add load-test data: 50 projects, 10,000 issues, 50,000 comments |
| `npm run db:reset` | Drop the dev database, re-run migrations, then seed |
| `npm run email:dev` | Send a sample email to Mailpit |

Run drizzle-kit only through these scripts; they set the `react-server` condition that `server-only` imports need.

Run part of the test suite:

```bash
npx vitest run src/domain/issues/issue.test.ts
```

```bash
npx vitest run -t "REQ-016.4"
```

```bash
npx vitest run --project components
```

### Conventions

- Work goes task by task from the [execution plan](docs/execution-plan.md), tests first. A task is done when its examples pass and `npm test`, `npm run lint` and `npm run typecheck` are green.
- If the spec is wrong or silent, fix the spec first (with a changelog line), then the code.
- No comments in code under `src/`. Names, types and test titles carry the meaning.
- Build UI bottom-up from the Track Lite kit in `src/components/ui/track-lite/`. Never load fonts, icons or styles from a CDN; the Content Security Policy allows only `'self'`.
- Biome formats with 2-space indent and 110-column lines. Use `import type` for types, and no enums or namespaces.

More detail for contributors and coding agents is in [CLAUDE.md](CLAUDE.md).

## Deployment

Deployment (servers, the reverse proxy, process supervision, deploys, rollbacks and backups) is maintained outside this repository.