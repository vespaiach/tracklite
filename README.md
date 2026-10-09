# Tracklite

A small, self-hosted issue tracker for one invite-only team.

## Why

Linear and its peers are built for many teams and priced per seat. A team of under about 15 people that only needs to file issues, move them across a board and talk about them in comments ends up paying for, and wading through, cycles, roadmaps, integrations and custom workflows it never uses.

Tracklite keeps the core and drops the rest:

- **Projects** with a key (`WEB`), a Markdown description and labels.
- **Issues** numbered per project (`WEB-42`), with a fixed set of statuses and priorities, an assignee and up to 10 labels.
- **Board view** with drag and drop (mouse and keyboard), and a **list view** with search, filters and sort kept in the URL.
- **Comments** with `@mentions`, on issues and on projects.
- **My issues**, the landing page after sign-in.
- **Email notifications** for assignments and mentions.
- **Invitation-only accounts** with member and admin roles. No public sign-up, no SSO.

Everything runs on one small VPS with PostgreSQL and nothing else: no Redis, no paid queue, no third-party services except an email provider and off-site backup storage.

The full scope, including what is deliberately left out, is in the [spec](docs/tracklite-spec.md).

## How the project is built

Tracklite is being rebuilt from its documents, one task at a time:

| Document | What it holds |
|---|---|
| [docs/tracklite-spec.md](docs/tracklite-spec.md) | What the product does. Rules have IDs such as `REQ-047`, `SEC-004`, `STD-5`, each with numbered examples (`REQ-047.2`). The spec wins over everything else. |
| [docs/tech-design.md](docs/tech-design.md) | Technical decisions, cited by section (`§1.7`) and decision ID (`D-36`). |
| [docs/build-plan.md](docs/build-plan.md) | Milestones M0–M12 split into small tasks, with what each one reads, needs and must pass. Ticked boxes show what is built. |
| [docs/design-system.md](docs/design-system.md) | Voice, colour roles, sizes and icons for the Track Lite UI kit. |
| [docs/ADRs/](docs/ADRs/) | Architecture decision records. |
| [ops/README.md](ops/README.md) | Server set-up, deploys, rollbacks and backups. |

Tests are named after the spec example they prove, e.g. `it("REQ-016.4: concurrent creates get distinct numbers")`, so `grep -rn REQ-016 src` shows how a rule is covered.

## Architecture

```
                       ┌──────────────────────────── VPS ────────────────────────────┐
 browser ──HTTPS──▶    │ Caddy ──▶ tracklite-web (next start)  ──┐                   │
                       │                                         ├──▶ PostgreSQL 18  │
                       │           tracklite-worker (node)  ─────┘                   │
                       └──────────────┬──────────────────────────────┬───────────────┘
                                      ▼                              ▼
                              Resend (email API)            Cloudflare R2 (backups)
```

- **Caddy** terminates TLS, sends HSTS and the security headers, and proxies to the web process.
- **tracklite-web** is `next start`. It serves the single-page-app shell, the JSON API under `/api`, `/health` and the email bounce webhook under `/webhooks`.
- **tracklite-worker** is a Node entry point (`scripts/worker.ts`) from the same codebase. Every 5 seconds it sends queued notification emails using `for update skip locked`, and once an hour it deletes expired data.
- **PostgreSQL 18** holds all state, including the notification email queue.

All four run under systemd. A daily `pg_dump` is encrypted with `age` and uploaded to R2.

### Browser app

The app is a strict single-page app. Every page address returns the same HTML shell (`src/app/[[...path]]/page.tsx`), which loads `<ClientApp />` in the browser only. From there:

- **React Router** (data mode, lazy routes) does the routing and the signed-out redirect to `/sign-in?next=…`.
- **RTK Query** holds all server data and loads it through `/api`. Screens refetch when opened; there is no polling. Board moves are optimistic and roll back on failure.
- **Redux** has one UI slice, for toasts. List filters live in the URL and form drafts in component state.

There is no server-side data fetching in pages, so every read and write passes through the same API and the same permission checks.

### API

Each route handler is wrapped in `apiRoute` ([src/server/api-route.ts](src/server/api-route.ts)), which:

1. rejects cross-site writes with `403`;
2. authenticates the session (`401`), unless the route is public;
3. validates the JSON body against a Valibot schema from `src/schemas/` (`422`);
4. calls one domain function in `src/server/`, passing the signed-in member as `actor`;
5. maps a thrown `ApiError` to `{ error: { message, fields? } }`;
6. writes one JSON log line, without bodies or tokens.

Routes never check roles. The domain functions are the only permission layer: admin-only functions start with `assertAdmin(actor)`, and ownership checks run once the row is loaded ([ADR 0001](docs/ADRs/0001-permission-checks-in-domain.md)). Each domain function opens its own transaction, so an action and the notification rows it creates commit together.

Every expiry and time-window check uses the database's `now()`, never the app server's clock.

### Source layout

```
src/
  app/            Next.js routes: the page shell, /api, /health, /webhooks
  client/         the browser app: store, API slice, routes, screens
  components/ui/  the Track Lite design system
  schemas/        Valibot request body schemas
  server/         domain functions, database schema, email, worker
  lib/markdown/   Markdown rendering and mention parsing
  test/           test harness and data factories
scripts/          worker, migrations, seed and setup commands
migrations/       drizzle-kit migrations
ops/              Caddy, systemd, deploy, rollback and backup scripts
```

## Stack

| Area | Choice |
|---|---|
| Runtime | Node.js ≥ 24, TypeScript |
| Web framework | Next.js 16 (App Router, used as an SPA host and API server) |
| UI | React 19, React Router, Redux Toolkit and RTK Query, React Aria Components, Phosphor icons, Tailwind CSS 4 with the Track Lite `tl-*` classes and tokens |
| Validation | Valibot |
| Database | PostgreSQL 18, Drizzle ORM over postgres.js, drizzle-kit migrations, `pg_trgm` for search |
| Auth | Argon2id passwords (`@node-rs/argon2`), session cookies, tokens stored as sha256 hashes |
| Email | Resend in production, Mailpit in development, an in-memory outbox in tests |
| Markdown | react-markdown, remark-gfm, unified |
| Testing | Vitest (node and jsdom projects), Testing Library |
| Lint and format | Biome |
| Hosting | One Debian VPS, Caddy, systemd, Cloudflare R2 for backups |

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

Open http://localhost:3000 and sign in as one of the seeded members (the password is in `src/server/seed.ts`). To send notification emails, run the worker in a second terminal:

```bash
npm run worker
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run worker` | Run the notification and cleanup worker |
| `npm test` | Run every test (needs `TEST_DATABASE_URL`) |
| `npm run lint` | Biome check (`npx biome check --write` to fix) |
| `npm run typecheck` | `next typegen` and `tsc --noEmit` |
| `npm run db:generate` | Write a migration from `src/server/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Add dev members and admins |
| `npm run db:seed:load` | Add load-test data: 50 projects, 10,000 issues, 50,000 comments |
| `npm run db:reset` | Drop the dev database, re-run migrations, then seed |
| `npm run setup` | Create the first admin (used once on a new server) |
| `npm run email:dev` | Send a sample email to Mailpit |

Run drizzle-kit only through these scripts; they set the `react-server` condition that `server-only` imports need.

Run part of the test suite:

```bash
npx vitest run src/server/issues.test.ts
```

```bash
npx vitest run -t "REQ-016.4"
```

```bash
npx vitest run --project components
```

### Conventions

- Work goes task by task from the [build plan](docs/build-plan.md), tests first. A task is done when its examples pass and `npm test`, `npm run lint` and `npm run typecheck` are green.
- If the spec is wrong or silent, fix the spec first (with a changelog line), then the code.
- No comments in code under `src/`. Names, types and test titles carry the meaning.
- Build UI bottom-up from the Track Lite kit in `src/components/ui/track-lite/`. Never load fonts, icons or styles from a CDN; the Content Security Policy allows only `'self'`.
- Biome formats with 2-space indent and 110-column lines. Use `import type` for types, and no enums or namespaces.

More detail for contributors and coding agents is in [CLAUDE.md](CLAUDE.md).

## Deployment

Production is one VPS set up by `ops/provision.sh`. `ops/deploy.sh` builds a release, runs migrations and switches to it, keeping the previous release for `ops/rollback.sh`. See [ops/README.md](ops/README.md) and the [runbook](ops/runbook.md).