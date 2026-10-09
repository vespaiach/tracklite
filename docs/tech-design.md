# Tracklite: Technical design

Companion to `docs/tracklite-spec.md` (v0.24). The spec says *what* the product does; this file records only the technical decisions the spec leaves open. If they disagree, the spec wins and this file gets fixed.

## 1. Architecture

### 1.1 What runs where

```
                       ┌──────────────────────────── VPS ────────────────────────────┐
 browser ──HTTPS──▶    │ Caddy ──▶ tracklite-web (next start)  ──┐                   │
                       │                                         ├──▶ PostgreSQL 18  │
                       │           tracklite-worker (node)  ─────┘                   │
                       └──────────────┬──────────────────────────────┬───────────────┘
                                      ▼                              ▼
                           email provider HTTP API        off-VPS backup storage
 uptime checker ──GET /health──▶ (through Caddy)          (OPS-003)
 email provider ──POST /webhooks/email──▶ (through Caddy)
```

| Process | What it does | Managed by |
|---|---|---|
| **Caddy** | Gets and renews TLS certificates, redirects HTTP to HTTPS and sends HSTS (SEC-005). It also sets `X-Forwarded-For`, and the app reads the rightmost entry for SEC-001's per-IP limit. That closes the accepted limitation in spec §10. | systemd |
| **tracklite-web** | `next start`: the single-page-app shell (1.7), `/api/…`, `/health`, `/webhooks/email`. | systemd, `Restart=always` |
| **tracklite-worker** | A small Node entry point in `scripts/` built from the same codebase. It sends notification emails and runs cleanup (1.4). | systemd, `Restart=always` |
| **PostgreSQL** | All state, including the notification queue. | systemd (distro package) |

Using systemd for all four means no extra process manager. Logs go to journald, configured to keep 14 days (OPS-006).

### 1.2 Request flow

**Pages.** Every page address returns the same HTML shell. The browser app then does the routing, the signed-out redirects (STD-1) and all data loading, through the API (1.7). Every read and write therefore goes through the same API code and the same permission checks (SEC-006).

**API.** Each handler is wrapped in `apiRoute`, which runs these steps in order:

1. Reject cross-site writes with `403` (SEC-004).
2. Validate the session with `requireMember`. This step only says who is asking; it checks no role. A route declared `"public"` (sign-in, password resets, invitation lookups and acceptance, sign-out) skips it.
3. If the route declares a body schema, parse the JSON body and validate it with Valibot (D-42), failing fast with `422`. The schema checks shape and format only, with the spec's own messages, and passes the parsed, trimmed values on.
4. Call one domain function in `src/server/`, passing the signed-in member as its first argument, `actor`. `apiRoute` opens no transaction; the domain function opens its own with `db.transaction`. The domain layer is the single permission layer (spec §12, D-43). An admin-only function calls `assertAdmin(actor)` as its first statement, before any lookup, so a member gets `403` and learns nothing about whether the target exists. An ownership check ("author or admin") runs right after the row is loaded. The function then checks the rules that need the database (a key already used, the last admin) and writes. The action and any notification rows it creates commit together (spec §12).
5. Map a thrown `ApiError` to `401`/`403`/`404`/`409`/`410`/`422`/`429`/`503` with `{ error: { message, fields? } }`. Map anything else to `500`.
6. Write one JSON log line per request, without bodies or tokens (SEC-007). A signed-in request's line names the member as `actor` by username.

**Markdown.** The API returns the stored Markdown together with the list of members it mentions. The browser renders it with one shared component (SEC-002). The renderer highlights `@username` only when that username is in the mention list, so it doesn't need to look up members itself.

### 1.3 Time

Every expiry and time-window check uses the database's `now()` inside the query (`expires_at > now()`, `send_after <= now()`). The app server's clock is never used for these, so there's only one clock to trust. Tests move stored timestamps into the past rather than faking the clock. For example, a test for REQ-050.4 sets `expires_at = now() - interval '1 minute'`.

### 1.4 Background worker (DEC-004)

One loop, every **5 seconds**:

1. **Send due notification emails.** In a transaction, `select … from notification_emails where state = 'pending' and coalesce(next_attempt_at, send_after) <= now() order by send_after limit 10 for update skip locked`. For each email:
   - apply the drop checks (2.6);
   - build the email from the snapshots;
   - call the provider;
   - record `sent`, schedule a retry, or mark `failed`.

   Then commit.
2. **Cleanup (DATA-004)** runs once an hour: one `delete … where … < now() - interval …` per table.

How it meets DEC-004's requirements:

- **Survives a restart.** The queue is the `notification_emails` table, so pending emails survive a crash or deploy. systemd restarts the worker, and it picks up where it stopped.
- **Same VPS, no paid queue.** It's Postgres plus one Node process.
- **Delivered at least once.** If the worker dies after the provider accepted an email but before the commit, that email is sent again on restart. The email's `id` goes out as Resend's `Idempotency-Key`, so Resend drops the duplicate (section 5).
- **Safe to run twice.** `skip locked` means a second worker, for example while a deploy is switching over, never sends the same email.
- **Shutdown.** On `SIGTERM` it finishes the current batch, then exits.

Holding the transaction open during the provider call (about 1 s per email) is fine at this volume. It's what keeps "locked" and "being sent" the same thing, with no extra state column.

### 1.5 Emails sent during the request

Invitations (REQ-001) and password reset links (REQ-050) are **not** queued. They're sent inside the request, because STD-6 needs to know whether the send worked before answering.
- The token row is written first, then the email is sent, all in one transaction.
- If the send fails, the transaction rolls back, so no working link exists that nobody received, and the API answers `503`.

All email goes through one `sendEmail()` (5.2).

### 1.6 Configuration

- Settings come from environment variables: `.env.local` in development, and `/etc/tracklite/env` on the VPS (`root:deployer`, mode `640`, outside the release directory, OPS-006). The `deployer` account reads it to build and migrate; only root changes it.
- Both processes check them at startup and refuse to start if any are missing.
- Settings: `DATABASE_URL`, `APP_URL` (for links in emails), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `EMAIL_FROM` (section 5). `MAILPIT_HOST` and `MAILPIT_PORT` are optional and default to `localhost` and `8025`.
- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are required only when `NODE_ENV` is `production`; development sends through Mailpit and tests through the in-memory outbox (5.2).
- Tests run against `TEST_DATABASE_URL`, which must differ from `DATABASE_URL`. Before each run its schema is dropped and the migrations applied afresh.
- The backup (1.8) isn't part of the app. Its settings (`OWNER_EMAIL`, the age public key and the R2 token) live in `/etc/tracklite/backup.env` (`root:root`, mode `600`), which the `deployer` account can't read.

### 1.7 Browser app (single-page app)

Strict single-page app, as the Next.js docs define it: the app is served by one HTML document, and every route change, page transition and data fetch happens in the browser, with no full-page reloads.

**The shell.**
- `src/app/layout.tsx` holds `<html>`, `<body>`, the fonts (`next/font/google`, served from the app so the CSP's `font-src 'self'` holds) and the Track Lite stylesheet.
- One optional catch-all page, `src/app/[[...path]]/page.tsx`, renders `<ClientApp />` through `next/dynamic` with `ssr: false`. It's the same document for every address.
- `/api`, `/health` and `/webhooks` are more specific routes, so they're never caught by it.
- `src/proxy.ts` only sets the Content Security Policy and `Referrer-Policy` (4.9). It doesn't redirect pages; the browser app does.

**Routing.** React Router in data mode (`createBrowserRouter`), with routes lazy-loaded so each screen's code is downloaded on first visit.
- The route table is the API-004 list plus the routes added in section 6.
- `useBlocker` provides the "You have an unsent comment. Leave anyway?" prompt (REQ-035). That's the main reason to use React Router rather than hand-rolled `history.pushState`.
- An unknown address renders the Not found page (STD-4).

**Signed-in state (STD-1).**
- On startup the app calls `GET /api/me`:
  - `401` → go to `/sign-in?next={current address}`;
  - success → the member is kept in the RTK Query cache and the requested route renders.
- `/sign-in` and `/` send a signed-in member to `/my-issues`.
- **Return after sign-in (SEC-009).** `next` is used only if it starts with `/` but not `//` or `/\`; anything else goes to `/my-issues`. So `?next=https://evil.example` can't send anyone off-site.
- Any `401` later, such as an expired session or a deactivated member mid-edit (REQ-007.4), does the same redirect from the shared `baseQuery`.

**Redux Toolkit.** One store, created once in `ClientApp` and provided through `react-redux`.

- **RTK Query** (`createApi`, one `api` slice) holds all server data. The `baseQuery`:
  - wraps `fetch`, sends JSON and parses `{ error: { message, fields? } }`;
  - on `401`, redirects to sign-in;
  - leaves every other error to the component, which shows field errors (STD-3), an editor conflict (`409`, STD-8), or a toast.
- **Fresh data on every visit.** Queries use `refetchOnMountOrArgChange: true`, so each screen loads current data when opened. That matches "pages show current data when they load" (spec §12). There's no `refetchOnFocus` and no polling: no live updates in R1, and REQ-041.6 expects an open page to stay as it is.
- **Tags drive refreshing.** Tags are per type, with no IDs: `Me`, `Members`, `Invitations`, `Projects`, `Labels`, `Issue`, `Board`, `Comments`. A mutation invalidates its type, and a mounted screen showing that data refetches. `updateIssue` instead writes the saved issue into the `issue` cache, and invalidates `Labels` only on a `404` (a label deleted meanwhile). The list and My issues carry no tags; they rely on the refetch on every visit.
- **Optimistic board moves (NFR-005, REQ-026).** `moveIssue` updates the cached board in `onQueryStarted` before the request goes out. If the request fails, it undoes the change and shows a toast: the server's message, or "Couldn't move WEB-42" for a network error or a `5xx`. If it succeeds, it invalidates `Board(KEY)`, which refreshes the columns involved.
- **UI slice:** one `toast` slice (STD-9: one message at a time, 5 seconds, no dismiss).
- **Kept out of Redux on purpose:**
  - list-view filters, search and sort live in the URL (`useSearchParams`), since REQ-040 already makes the URL their home;
  - form drafts live in component state.

**Request IDs (STD-5).** A create form generates `crypto.randomUUID()` once, when the form opens or is reset, and reuses it for every retry of that submit.

**Loading states (STD-7).** One shared hook shows the loading indicator only after a request has been pending for 300 ms.

### 1.8 Backups (OPS-003)

A systemd timer runs a daily `pg_dump`, encrypts it with `age` to a public key and uploads it with `rclone` to Cloudflare R2, keeping the newest 14 (OPS-003). The private age key is kept off the VPS, so neither the VPS nor the R2 token can read a backup. A failure triggers the unit's `OnFailure=`, which emails `OWNER_EMAIL` through Resend (OPS-003.3). R2's free tier holds 14 dumps at no cost (NFR-009). Set-up and restore steps are in `ops/README.md`.

## 2. Schema

PostgreSQL via Drizzle ORM, connected through the `postgres` (postgres.js) driver (`drizzle-orm/postgres-js`). Tables, columns, constraints and indexes are in `src/server/schema.ts`; `drizzle-kit generate` writes migrations to `migrations/`. This section records only why the schema is shaped as it is. Every table has a `uuid` id unless stated, and every timestamp is `timestamptz` in UTC (DATA-003).

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
- A session ends by deleting its row: on sign-out, deactivation (REQ-007), a password change for the member's other sessions (REQ-049), or a reset (REQ-050). DATA-004's 30-day limit is a maximum, so deleting at once complies.
- A session is valid while `last_active_at > now() - 30 days` (REQ-006). To avoid a database write on every request, `last_active_at` is only rewritten when it's more than 1 hour old. At most 1 hour of the 30 days is lost, which is acceptable.

**`sign_in_attempts`** (failed sign-ins and wrong current passwords, REQ-049.3) and **`password_reset_requests`** have no `id`. SEC-001 counts the last hour's rows, so each is indexed on `(email, created_at)` and `(ip, created_at)`.

Tokens (SEC-003) are 32 random bytes, sent base64url-encoded, and stored as `sha256` hashes in a `bytea` column. A fast hash is enough here because the token itself has 256 random bits; only passwords need Argon2id (SEC-008).

### 2.3 Projects and labels

**`project_keys`** has one row per project key, inserted with the project and **never deleted**. That's what reserves the key forever (REQ-009.3), while the project row itself can be hard-deleted with a cascade (DATA-002).

**`projects`**: `description_edited_by` is the member who last saved the description, named in the STD-8 conflict message. If you saved from another tab, the message names you. Issues have the same column.

**`labels`** are unique per project ignoring capitals, on `(project_id, lower(name))` (REQ-021.2).

### 2.4 Issues

- **Numbering (REQ-016).** The create transaction locks the project row (`for update`, the same read that checks it isn't archived), then runs `update projects set next_issue_number = next_issue_number + 1 where id = $1 returning next_issue_number - 1`. The row lock makes two people creating at the same moment wait for each other, so they get different numbers (REQ-016.4). Deleting an issue never decrements the counter, so numbers aren't reused (REQ-016.2).
- **Board position (REQ-026, REQ-027).** `position` is a string sort key from the `fractional-indexing` package. The column is `text COLLATE "C"`, because the keys only sort correctly byte by byte (`Zz` before `a0`); a database whose default collation is a language one, such as `en_US.UTF-8`, would put a card moved to the top at the bottom. A drop between two cards generates a key between theirs; "move to top" generates a key before the column's first card. Only the moved row changes, so two members reordering different cards don't conflict (REQ-026.3). Columns sort by `(position, id)`: if two moves land between the same pair at once, they may get equal keys, and `id` breaks the tie consistently for everyone.
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

**`notification_emails`** has one row per email a recipient will get about one issue or project (`target_type`, `target_id`), with its `send_after`, `state`, retry count and Resend ID.

**`notifications`** has one row per notification, attached to the email it's combined into (REQ-045), with a **snapshot** of what the email needs: issue ID, issue title, project name and key, link path, and a plain-text excerpt of up to 500 characters.

No index covers `provider_message_id` (here or on `invitations`), `notifications.email_id` or `sessions.member_id`. At one team's volume these lookups scan small tables; add an index if one shows up in NFR-003 timings.

How the parts fit:

- **No FKs to issues, projects or comments.** Notifications about deleted issues and projects must still be sent (REQ-045.7), so these rows can't be cascade-deleted. The snapshot means the email can be built after its target is gone.
- **Joining an email (fixed wait).** In the same transaction as the user's action (spec §12), look for a `pending` email for that recipient and target with `send_after > now()`. If one exists, attach to it; if not, create one with `send_after = now() + 2 minutes`. A later notification never moves `send_after` (REQ-045.8). If two members act at the very same moment, the recipient can occasionally get two emails instead of one; that's accepted rather than adding a lock.
- **Drop checks at send time (REQ-045).** The worker re-checks each notification:
  - target issue or project no longer exists → **send** (REQ-045.7);
  - recipient deactivated → drop;
  - `assigned` but the issue's assignee is now someone else → drop;
  - `mentioned` but the comment is gone, or there's no longer a matching `mentions` row → drop.

  If every notification in an email is dropped, the email becomes `dropped`.
- **Retries (STD-6).** After a failed send, `attempts += 1` and `next_attempt_at` moves forward 1, then 4, then 10 minutes. After the third retry fails, the state becomes `failed`. A bounce sets `bounced` and isn't retried.

### 2.7 Deleting and cleanup

- **Deleting a project (DATA-002):** cascades to issues, labels, issue_labels, comments (both issue and project comments) and mentions. `project_keys` and notifications stay.
- **Deleting an issue:** cascades to issue_labels, comments and mentions.
- **DATA-004 cleanup:** an hourly job deletes rows older than their retention period, using `now() - interval`. These are among the few queries written in raw SQL.

## 3. API

Settles DEC-002. Request and response types live in the code; this section fixes paths, permissions and errors.

### 3.1 Conventions

- **Format.** JSON in and out. Times are ISO 8601 strings in UTC (DATA-003).
- **Addressing.** Issues by ID (`WEB-42`), projects by key (`WEB`), and members by username. All are matched ignoring capitals (REQ-016.5). Labels, comments and invitations use their `uuid`.
- **Unknown paths.** A catch-all, `src/app/api/[...path]/route.ts`, answers every method on an unknown `/api` path with `404` "Not found". It needs a session, so a signed-out caller gets `401` and learns nothing about which paths exist.
- **No tokens in paths.** Invitation and reset tokens always travel in the request body. The request log records only the path, never the query string, so the `?token=` on the reset *page* (API-004) isn't logged either (SEC-007).
- **Field-by-field saves.** The issue page saves each field as soon as it changes, with a `PATCH` that holds only that field. That's what makes STD-8's "last save wins" work per field. It also means one failed field leaves the others saved (REQ-020.4).
- **Creating twice.** Creates of issues and comments carry `requestId`. A repeat returns the first result with `200` instead of `201` (STD-5). `request_id` is unique across the whole table, so a repeat is found whatever project or issue it was sent to.
- **Small member data.** A member appears in responses as `{ username, fullName, initials, deactivated }`. Emails appear only in a full profile: `/api/me`, the admin member list, an admin's `PATCH /api/members/{username}`, and the new member's own `POST /api/members`. Password hashes never appear (SEC-008.2).

### 3.2 Errors

Every error body is `{ error: { message, fields? } }`, and the browser shows `message` as-is. That keeps all user-facing copy for server-side outcomes in one place.

| Status | When | Browser shows |
|---|---|---|
| `401` | No valid session: signed out, expired or deactivated (STD-1, REQ-007.4) | Redirect to `/sign-in?next=…` |
| `403` | Not allowed (STD-2), a cross-site write (SEC-004), or a write to an archived project, with the message "This project is archived" (REQ-013.4) | Toast (STD-9) |
| `404` | The target doesn't exist. The message names it: "Not found", "This issue was deleted", "This comment was deleted", "That label no longer exists". Reading a missing issue or its comments gets "Not found"; a write to one gets "This issue was deleted" | Not-found page on load (STD-4); toast on save (STD-9) |
| `409` | Stale save of a description or comment: "This was changed by Alex Kim. Copy your text and reload." (STD-8) | Message in the editor; text kept |
| `410` | An invitation or reset link that's expired, used or revoked (REQ-002.2, REQ-002.4, REQ-050.4) | The page's expired state |
| `422` | Invalid input. With `fields`: one error per field (STD-3). Without `fields`: a form-level refusal, such as "Already a member", "There must be at least one admin." or "Incorrect email or password." | Next to the fields, or beside the form |
| `429` | A SEC-001 limit: "Too many attempts. Try again later." | Beside the form |
| `503` | An invitation or reset email couldn't be sent (STD-6) | Toast |
| `500` | Anything else | Toast "Couldn't save. Try again." or the "Couldn't load this." state (DEC-006) |

A rule that needs the database also answers with a field error: "Key already used" (`key`), "Label already exists" (`name`), "Username taken" (`username`) and "Incorrect password" (`currentPassword`).

Changing a field that can't be changed (username, email, project key) gets `422` with a field error. The stored value stays as it was (REQ-003.3, REQ-010.1).

A body schema failure gets `422` with "Check the highlighted fields" and the first failing rule's message for each field (STD-3). A rule on the body as a whole, such as "Change one field at a time" on an issue `PATCH`, gets `422` with its own message and no `fields`. A field missing from the body gets the field error "Required". A body that isn't valid JSON, or isn't a JSON object, gets `422` "Couldn't read the request." with no `fields`. The browser never sends either, so this only keeps such requests from becoming a `500`. Query strings and path segments aren't covered by schemas.

### 3.3 Endpoints

"Member" means any signed-in active member. Every write to something inside an archived project (its description, issues, comments, labels) gets `403` "This project is archived". Admins can still unarchive or delete an archived project; renaming it gets the same `403`.

**Sign-in and account** (no session needed unless noted)

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `POST /api/sessions` | `{ email, password }` → `204`, sets the cookie | Anyone | REQ-047, SEC-001 |
| `DELETE /api/sessions/current` | → `204`, with or without a session | Anyone | REQ-006 |
| `POST /api/password-reset-links` | `{ email }` → `204` whether or not the email belongs to a member | Anyone | REQ-050, SEC-001 |
| `POST /api/password-reset-lookups` | `{ token }` → `204`, or `410` "This link has expired". Doesn't use up the link | Anyone | REQ-050.5, REQ-050.9 |
| `POST /api/password-resets` | `{ token, password }` → `204`. Ends all the member's sessions, then sets a new cookie | Anyone | REQ-050 |
| `POST /api/invitation-lookups` | `{ token }` → `{ email }`, or `410` with the same messages as accepting | Anyone | REQ-002 |
| `POST /api/members` | `{ token, fullName, username, password }` → `201` and the new member's profile, sets the cookie (accepting an invitation) | Anyone | REQ-002, REQ-003 |
| `GET /api/me` | → profile, including email and role | Member | REQ-003.3 |
| `PATCH /api/me` | `{ fullName }` | Member | REQ-003 |
| `PUT /api/me/password` | `{ currentPassword, newPassword }` → `204`. Ends the member's other sessions. A wrong current password gets the field error "Incorrect password" and counts toward the sign-in limit (`429`, 4.5) | Member | REQ-049, SEC-001 |

**Members and invitations**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/members` | → all members, active and deactivated. Used for the assignee picker, the @mention suggestions and the members page. With about 15 people, the browser filters the list itself. | Member (emails only for admins) | DATA-001, REQ-037 |
| `PATCH /api/members/{username}` | `{ role?, deactivated? }` → the member's profile, including email and role | Admin | REQ-007, REQ-008, REQ-052 |
| `GET /api/invitations` | → invitations that are Pending, Bounced or Expired | Admin | REQ-001, REQ-051 |
| `POST /api/invitations` | `{ email }` → `201`. If an open invitation for that email exists, this works as a resend. A deactivated member's email gets `422` "This person is deactivated. Reactivate them instead." | Admin | REQ-001 |
| `POST /api/invitations/{id}/resend` | → `200`, new link | Admin | REQ-001.3 |
| `DELETE /api/invitations/{id}` | → `204`, revoked | Admin | REQ-001.4 |

**Projects and labels**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/projects?archived=false\|true` | → sidebar list, or the Archived list | Member | REQ-013, REQ-015 |
| `POST /api/projects` | `{ name, key }` → `201` | Admin | REQ-009 |
| `GET /api/projects/{KEY}` | → name, key, description, `descriptionVersion`, mentions, `archivedAt` | Member | REQ-046 |
| `PATCH /api/projects/{KEY}` | `{ name?, archived? }` (Admin), or `{ description, descriptionVersion }` (Member) | Per field | REQ-011, REQ-012, REQ-013 |
| `DELETE /api/projects/{KEY}` | → `204`. The typed-key confirmation is checked in the browser | Admin | REQ-014 |
| `GET /api/projects/{KEY}/labels` | → labels sorted by name ignoring capitals, each `{ id, name, color, issueCount }` | Member | REQ-021, REQ-021.5 |
| `POST /api/projects/{KEY}/labels` | `{ name, color }` → `201`, the label | Member | REQ-020.2, REQ-021 |
| `PATCH /api/labels/{id}` | `{ name?, color? }` → the label. A missing label gets `404` "That label no longer exists" | Member | REQ-021 |
| `DELETE /api/labels/{id}` | → `204` | Member | REQ-021.3 |

**Issues and views**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/projects/{KEY}/board` | → 5 columns in order, each `{ status, count, cards }`, cards sorted by `(position, id)`. A card is `{ id, title, priority, assignee, labels }`: `assignee` is a member or `null`, and `labels` holds all of the issue's labels as `{ id, name, color }`, sorted by name ignoring capitals (the card trims them to 3 and "+N"). Done and Canceled hold only issues moved there in the last 14 days | Member | REQ-024, REQ-025, REQ-028 |
| `GET /api/projects/{KEY}/issues` | Query: `status` and `priority` (enum values), `assignee` (username, or `-` for Unassigned), `label` (label name, ignoring capitals), each repeatable; `q`; `sort` (`id`, `status`, `priority`, `updated`; default `updated`); `dir` (`asc`, `desc`; default `desc` for `updated`, `asc` otherwise); `offset`. Ties sort most recently updated first. Unknown values are ignored → `{ issues, hasMore, deactivatedAssignees }`: up to 100 rows, each `{ id, title, status, priority, assignee, labels, updatedAt }` with labels as on the board; `deactivatedAssignees` lists the deactivated members still assigned to an issue in the project, for the assignee filter, whatever the filters | Member | REQ-036…040 |
| `POST /api/projects/{KEY}/issues` | `{ requestId, title, status? }` → `201`. `status` is used by the column **+** buttons; a missing or unknown value becomes `backlog` | Member | REQ-016, REQ-029 |
| `GET /api/issues/{ID}` | → the issue with its labels, assignee, `createdBy`, `createdAt`, `updatedAt`, `descriptionVersion`, mentions and `archived` | Member | REQ-016 |
| `PATCH /api/issues/{ID}` | One of `{ title }`, `{ status }`, `{ priority }`, `{ assignee }` (username or `null`), `{ labelIds }`, or `{ description, descriptionVersion }` | Member | REQ-016…022, REQ-027.4 |
| `PUT /api/issues/{ID}/position` | `{ status, place: "top" \| "bottom" \| { after: "WEB-5" } }` | Member | REQ-026, REQ-027, REQ-030 |
| `DELETE /api/issues/{ID}` | → `204` | Creator or Admin | REQ-023 |
| `GET /api/my-issues` | → the member's issues in active projects, as groups `{ status, count, issues }` in status order with empty groups left out (so nothing assigned is `[]`). A row is `{ id, title, projectName, priority, labels, updatedAt }` with labels as on the board, sorted by priority from Urgent down, then most recently updated. Done and Canceled hold only issues moved there in the last 14 days | Member | REQ-041, REQ-042 |

**Comments**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/issues/{ID}/comments`, `GET /api/projects/{KEY}/comments` | → every comment, oldest first, each with its mentions | Member | REQ-032 |
| `POST /api/issues/{ID}/comments`, `POST /api/projects/{KEY}/comments` | `{ requestId, body }` → `201` and the comment; a repeated `requestId` → `200` and the original (STD-5) | Member | REQ-031 |
| `PATCH /api/comments/{id}` | `{ body, version }` → the comment; a stale `version` → `409` (STD-8); a deleted comment → `404` "This comment was deleted" | Author | REQ-033 |
| `DELETE /api/comments/{id}` | → `204` | Author or Admin | REQ-034 |

A comment is `{ id, body, author, createdAt, editedAt, version, mentions }`: `author` is a member as in 3.1, `editedAt` is `null` until the first edit, and `mentions` lists the members it mentions. The body is stored as sent; it must have something other than spaces ("Comment required") and at most 10,000 characters ("Too long (max 10,000)").

**Outside `/api`**

| Method and path | Notes | Spec |
|---|---|---|
| `GET /health` | `200` if `select 1` succeeds, otherwise `503` | OPS-005 |
| `POST /webhooks/email` | Checks the provider's signature (`401` if it doesn't match). It skips the same-site check, since the provider is always cross-site, and marks emails `bounced` | API-003 |

### 3.4 Details worth fixing now

- **Moving a card.** `place: { after: "WEB-5" }` names one neighbour. The server computes a key between WEB-5 and whatever card follows WEB-5 *right now*, so a board that's out of date still lands the card next to the card the member chose (REQ-026.4). If WEB-5 is no longer in that column, the card goes to the top. The `PUT` changes `status` and `status_changed_at` only when the status actually changes, and it never touches `updated_at` for a move within one column (REQ-036.5).
- **A status change from anywhere else** (`PATCH { status }`) also puts the card at the top of its new column (REQ-027.4).
- **List paging uses `offset`**, not keyset cursors. With no live updates (spec §3), rows only shift if someone else edits mid-scroll, and that's accepted.
- **The invitation page** (`/invite?token=…`) calls `POST /api/invitation-lookups` with the token in the body when it opens. It needs to show "expired" straight away (REQ-002.2), and the email to greet the person with. The reset page does the same with `POST /api/password-reset-lookups`, so an expired or malformed link shows "This link has expired" with no form (REQ-050.9). Neither lookup uses up the link.
- **Wrong email or password** returns `422` with no `fields`, not `401`. A `401` would make the browser treat it as an ended session.

## 4. Auth and security

### 4.1 Passwords (REQ-048, SEC-008)

- **Hashing.** Argon2id via `@node-rs/argon2`, which ships prebuilt binaries, so nothing is compiled on the VPS.
  - Settings: memory 19 MiB, 2 iterations, parallelism 1 (OWASP's baseline). That takes about 50 ms per hash on a small VPS.
  - The settings are stored inside each hash. When they change, a successful sign-in re-hashes the password with the new ones.
- **Length rule.** 12 to 128 is counted in Unicode code points (`[...password].length`), not JavaScript string length. Otherwise an emoji would count as 2.
- **No changes to the password.** No trimming and no Unicode normalisation (REQ-048.4): the exact bytes typed are what get hashed.
- **Unknown emails.** Sign-in verifies against a fixed dummy hash when the email isn't an active member, so both cases cost one Argon2id verify. A reset request still takes longer for a member, because only then is an email sent; spec §10 accepts that difference.

### 4.2 Tokens (SEC-003)

- Invitation, reset and session tokens are 32 bytes from `crypto.randomBytes`, base64url-encoded.
- The database stores `sha256(token)`, and lookups use that hash (section 2.2). The raw token exists only in the email or cookie, and in memory during the request.
- The reset page reads `?token=` once, then removes it from the address bar with `history.replaceState`. The token is still in the page's memory for the submit.

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

Anything else gets `403`. `SameSite=Lax` is a second layer of protection. Together they cover SEC-004 with no CSRF token stored in forms or state. The one exception is `/webhooks/email`, which is checked by signature instead (3.3).

### 4.5 Sign-in and reset limits (SEC-001)

**Sign-in** (`POST /api/sessions`), in order:
1. Lowercase and trim the email.
2. Count the last hour's `sign_in_attempts` rows for that email and for that IP. If there are 10 or more for the email, or 30 or more for the IP, answer `429`. This check comes **before** the password check, so a correct password is also refused (SEC-001.1).
3. Look up an active member by `lower(email)` and verify the password.
4. If either step fails, insert a `sign_in_attempts` row and answer `422` "Incorrect email or password.". Unknown and deactivated emails count the same way (SEC-001.3).
5. On success, create the session. Earlier failures stay counted until they're an hour old; a success doesn't reset them.

**Changing a password** (`PUT /api/me/password`) uses the same per-email count: a wrong current password inserts a `sign_in_attempts` row, and past the limit even the right one gets `429` (REQ-049.3).

**Reset request** (`POST /api/password-reset-links`): the same count against `password_reset_requests` (5 per email, 20 per IP), but **every** request is recorded, not just failures. The email is sent only if the address belongs to an active member.

**Details:**
- **IP address.** Taken from the rightmost `X-Forwarded-For` entry, which Caddy sets (1.1). In development without Caddy, it falls back to `127.0.0.1`.
- **Races.** Two requests arriving at the same moment can both pass the count, so a limit can be exceeded by one. That's accepted rather than adding a lock.

### 4.6 Invitation and reset links

**Accepting an invitation** (`POST /api/members`). The body schema has already checked the profile and password (`422`, D-42), so a malformed form is refused before the link is looked at. A token that isn't a string is treated as an unknown link. Then, in one transaction:
1. Lock the invitation found by hash (`for update`).
2. Answer `410` with the right message if needed:
   - revoked → "This invitation is no longer valid." (REQ-002.4);
   - expired, already accepted, or unknown (including a link replaced by a resend) → "This invitation has expired. Ask an admin for a new one." (REQ-002.2).
3. Refuse a taken username (`422`, REQ-003.2).
4. Insert the member, set `accepted_at`, create a session.

If the request arrives with a valid session, it's refused with `403` "You're signed in as {name}. Sign out to accept this invitation." The page shows that state before the form appears (REQ-002.3). This check just stops a bypass through the API.

**Resetting a password** (`POST /api/password-resets`). The body schema has already checked the new password (`422`, D-42). Then, in one transaction:
1. Lock the token row.
2. Answer `410` "This link has expired" if it's used, expired, unknown, or the member is deactivated.
3. Set the hash, set `used_at` on **all** the member's unused tokens (REQ-050.6), delete the member's sessions, and create a new one.

**Opening a reset link** checks the token with `POST /api/password-reset-lookups`, which only reads it. A usable link shows the form; anything else shows "This link has expired" (REQ-050.9). Because the check never uses the link up, a mail scanner opening it changes nothing (REQ-050.5). If a valid session exists, the page shows "You're signed in as {name}. Sign out to reset a password." and never looks at the token (REQ-050.8).

### 4.7 Markdown (SEC-002, DATA-001)

One module, `src/lib/markdown/`, used for both **rendering** in the browser and **finding mentions** on the server. Because both use the same parser, `@sam` inside code is skipped the same way in both places (DATA-001.4).

- **Parser:** `remark-gfm` (checklists, tables, strikethrough) on `remark-parse`. `parse.ts` exports the remark plugins; the browser renders with `react-markdown` using them, and the server runs the same plugins through `unified` and takes plain text with `mdast-util-to-string`. `rehype-raw` is never used.
- **Raw HTML.** A small remark plugin turns every `html` node into a `text` node. `<script>` and `<img onerror>` then show as literal text (REQ-012.3, SEC-002.1), rather than depending on a library default.
- **Links.** A `urlTransform` allows only `http:`, `https:` and `mailto:`. A link with any other scheme renders as its plain text, not an `<a>` (SEC-002.2). Allowed links get `target="_blank" rel="noopener noreferrer"`.
- **Mentions.** A remark plugin walks text nodes outside `code` and `inlineCode` and matches `(?<![A-Za-z0-9._%+@-])@([a-z0-9-]{2,20})(?![a-z0-9-])`. The look-behind skips email addresses and `foo@sam`; the look-ahead stops at punctuation, so `(@sam)` and `@sam, thanks` both match (DATA-001.5, DATA-001.6). Mentions are found in issue descriptions, project descriptions and comments.
  - On the server, the matches become the `mentions` rows: active members only (2.5).
  - In the browser, a match is shown highlighted, with the full name on hover, only if the username is in the `mentions` list from the API (1.2). Mentions aren't links (DATA-001).

### 4.8 Logs (SEC-007)

- The logger takes a fixed set of fields: time, level, event, method, path (without the query string), status, `durationMs`, `actor` (the member's username), and error class and message.
- It never logs request or response bodies, headers or cookies.
- Besides the request line, only email events are logged, as short phrases such as `email bounced, invitation {id}` (SEC-007.1).
- Errors from the email provider are logged without the message content.

### 4.9 Response headers

Caddy adds these to every response:
- `Strict-Transport-Security: max-age=31536000` (SEC-005)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`, so no referrer goes to other sites (SEC-010) and a page address containing a token never leaks through the `Referer` header

**Content Security Policy (SEC-010).** Next.js puts small inline scripts in every page, so the policy needs a fresh nonce per request. `src/proxy.ts` generates it and sets, on page requests only:

```
default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

In development `script-src` also gets `'unsafe-eval'`, which Next.js's dev tooling needs. It also sets `Referrer-Policy: same-origin`, so SEC-010 holds even without Caddy. Next.js reads the nonce from the request and adds it to its own scripts; the root layout awaits `connection()` so the shell is rendered per request. A nonce makes the shell render per request instead of being cached, which costs nothing here because there's one small shell.

**Access logs (SEC-007).** Caddy's access log uses a `query` filter that deletes the `token` parameter, so `/invite` and `/reset-password` addresses are logged without it.

## 5. Notifications and email

### 5.1 Provider: Resend (DEC-003)

| DEC-003 requirement | Resend |
|---|---|
| HTTP API | `POST https://api.resend.com/emails`, called with plain `fetch`, with no SDK. |
| Bounce webhooks, signed (API-003) | `email.bounced` events, signed with Svix-style HMAC headers (5.4). |
| Fits NFR-009 (< $20/month in total) | The free plan, 3,000 emails/month and 100/day at the time of writing; check on sign-up. The VPS (~$6) plus the domain (~$1) leaves plenty of headroom. |
| Team domain with SPF and DKIM | Verified sending domain (5.5). |
| API key only in server config | `RESEND_API_KEY` in `/etc/tracklite/env` (1.6, OPS-006). |

Also useful: Resend accepts an `Idempotency-Key` header, which closes the duplicate-on-crash gap in 1.4.

**Risk: the 100/day cap.** A team of under 15 with 2-minute combining should stay well below it, but a very busy day could hit it. Sends over the cap fail and are retried like any other failure, so a notification can end up `failed`, and an invitation or reset shows STD-6's "We couldn't send the email". If that ever happens, the fix is a paid plan or Amazon SES. The `sendEmail()` module (5.2) is the only code that would change.

### 5.2 Sending

`sendEmail({ to, subject, text, idempotencyKey? })` picks its backend by `NODE_ENV`:
- **production:** Resend's HTTP API (5.1);
- **development:** Mailpit's send API (`http://localhost:8025/api/v1/send`), so every email shows in Mailpit's inbox with no Resend key;
- **tests:** an in-memory outbox that tests can inspect, and make fail on demand (REQ-001.7, REQ-050 with the service down, the STD-6 retries).

- **Plain text only.** No HTML templates. REQ-044 already asks for the excerpt "as plain text", text emails deliver well, and it's one template per email instead of two.
- **From:** `EMAIL_FROM`, for example `Tracklite <notify@mail.example.com>`.
- **Timeout:** 10 seconds (`AbortSignal.timeout`).
- **How results are treated:**
  - any `2xx` is a success, and the response's `id` is stored as `provider_message_id`;
  - anything else, a network error or a timeout is a failure;
  - for notifications, a failure is retried as in 2.6 (1, 4, 10 minutes, then `failed`); for invitations and resets, a failure is `503` (1.5).
- **Logging:** a failure logs the HTTP status and Resend's error *name* only, never the recipient's text (SEC-007).

### 5.3 Email content

The wording of every email is in the spec (§9, "Email content"). That's where to change it. How the code builds each email:

- **Templates.** One plain function per email type in `src/server/email/templates.ts`. Each takes the snapshot (2.6) or the token and returns `{ subject, text }`. Tests check each one against the spec's wording.
- **Excerpts** are made with the shared Markdown module's text extraction (4.7), when the notification is created.
- **Comment links** end in `#comment-{id}`. The browser scrolls to that comment (section 6).

### 5.4 Bounce webhook (API-003)

`POST /webhooks/email`:
1. Read the **raw** body with `request.text()`, since the signature covers the exact bytes.
2. **Verify the signature** using `svix-id`, `svix-timestamp` and `svix-signature`:
   - compute HMAC-SHA256 of `{id}.{timestamp}.{body}` with the base64 secret from `RESEND_WEBHOOK_SECRET` (the part after `whsec_`);
   - accept if it matches any `v1,` signature in the header (constant-time compare) and the timestamp is within 5 minutes.

   Otherwise answer `401`. This is about 20 lines with `node:crypto`, with no `svix` dependency.
3. Handle the event:
   - `email.bounced` → look up `provider_message_id`:
     - in `notification_emails`: set `bounced` and log `email bounced, notification {id}` (REQ-045.6);
     - in `invitations`: set `bounced_at`, so the members page shows Bounced (REQ-051), and log `email bounced, invitation {id}`;
     - in neither (a reset email): log `email bounced, untracked`.
   - any other event type → ignore.
4. Answer `200` whenever the signature is valid, even for ignored events. Otherwise Resend keeps retrying.

### 5.5 Domain setup (one-time, before launch)

Mail is sent from a subdomain, so the app's sending reputation is kept apart from the team's normal email. The SPF, DKIM and DMARC records and the webhook registration are in `ops/monitoring-and-email.md`.

### 5.6 Development and tests

The webhook signature is tested with a known secret and a hand-built signature. Development and test email are covered in 5.2.

## 6. Screens

Behaviour and copy come from the spec; this section only adds the routes, layout and pages the spec doesn't describe. All components come from the Track Lite design system (`src/components/ui/track-lite/`). Complex widgets use React Aria Components; the kit's `Dialog` also takes `FocusScope` from the lower-level `react-aria` hooks package.

### 6.1 Routes

The routes are API-004's addresses (`src/client/routes.tsx`).
- `/sign-in` and `/forgot-password` send a signed-in member to `/my-issues`, and `/` goes there too (or to sign-in).
- `/reset-password` and `/invite` show a signed-in member a sign-out prompt (REQ-050.8, REQ-002.3).
- `/project/{KEY}/settings` and `/settings/members` are admin-only.
- Any other address shows Not found (STD-4).

**Permissions.**
- A member who reaches an admin-only route sees "You don't have permission to do that." (STD-2) in the page area; the links to it are hidden.
- An unknown project key or issue ID shows Not found (STD-4).

**Addresses.**
- When an address uses lower case, such as `/issue/web-42`, the app rewrites it to the canonical form `/issue/WEB-42` with `replace` (REQ-016.5).
- An address ending in `#comment-{id}` scrolls to that comment once comments load, and highlights it briefly. If the comment is gone, the page stays at the top.

### 6.2 App shell

Every signed-in screen sits in the same shell.

**Sidebar**, top to bottom:
- **My issues**.
- **Projects:** the active projects, as "Name · KEY", sorted as in REQ-015. Admins also get a **+** that opens the New project dialog (name and key).
- **Archived projects**.
- **Members** (admins only).
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
- **Members** (admin): the invite field, then the invitations table, then the members table sorted by name. Each row's actions are in a **⋯** menu (REQ-051); Revoke and Deactivate ask for confirmation.
- **Project settings** (admin): name with **Save**, the key read-only, **Archive** / **Unarchive**, and **Delete** in a dialog whose button stays disabled until the key is typed exactly (REQ-014).
- **Archived projects:** each one opens its board, read-only.
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
| D-13 | Caddy as the reverse proxy | nginx | Automatic TLS and HSTS with a few lines of config. |
| D-14 | systemd + journald for processes and logs | pm2, logrotate | Already on the VPS. Retention is one setting. |
| D-21 | `@node-rs/argon2` | `argon2` (node-gyp) | Prebuilt binaries; nothing to compile on the VPS. |
| D-26 | Nonce-based CSP set in `src/proxy.ts` (SEC-010) | A CSP without script rules | SEC-010 requires that only the app's own scripts run, and Next.js's inline scripts need a nonce for that. |
| D-27 | React Router (data mode) inside the shell | Next.js routing; hand-rolled `pushState` | One HTML document for every route, plus `useBlocker` for REQ-035. |
| D-32 | Resend (DEC-003) | Postmark, Amazon SES | Free plan fits NFR-009, signed webhooks, idempotency keys, simple domain setup. Postmark's paid plan (~$15) plus the VPS goes over the $20 budget, and its webhooks aren't signed. SES is cheapest at volume, but its bounces come through SNS, which needs an AWS account and much more setup for 15 people. |
| D-34 | `fetch` + hand-written signature check | Resend SDK, `svix` package | Two small functions instead of two dependencies. |
| D-36 | React Aria `GridList` drag and drop | dnd-kit | Already in the stack, and accessible by keyboard and screen reader out of the box. Edge auto-scroll confirmed by the M5.1 spike (D-40). |
| D-37 | New issue: title-only dialog, then go to the issue | A full create form | Matches REQ-016's flow ("enters a title"); everything else is edited on the issue page. |
| D-39 | Track Lite design system, ported from its Claude Design project into `src/components/ui/track-lite/` | Hairline; a component library from npm | Made for this product. Fonts load through `next/font` and icons through `@phosphor-icons/react` instead of the project's CDN links, which the CSP (D-26) would block. |
| D-40 | Keep D-36 with no fallback, after the M5.1 spike. Each column's body around its `GridList` is the scroll box, with `position: relative`; each card has a `<Button slot="drag">` | Writing our own edge auto-scroll; a separate drag library | Mouse drags across 5 columns, into an empty column (`onRootDrop`) and within a column (`onReorder`) all landed in the right place. Near a column's edge, the browser scrolls it natively, or React Aria's `useAutoScroll` does in Safari. Keyboard drags (Enter on the drag button, Tab between columns, arrows, Enter) work and are announced. Without `position: relative` on the scroll box, the hidden keyboard drop targets scroll the whole page instead of the column. Without the drag button, cards that open the issue on click can only be dragged with Alt+Enter. |
| D-41 | Daily `pg_dump`, encrypted with `age` and copied to Cloudflare R2 with `rclone`, from a systemd timer | restic; Backblaze B2; a Hetzner Storage Box | Owner's choice. One plain encrypted file per day is easy to inspect and restore by hand, R2's free tier keeps the cost at zero (NFR-009), and the timer's `OnFailure=` gives the failure email with no extra service. |
| D-42 | Valibot body schemas declared per route and run by `apiRoute`; schemas live in `src/schemas/` (one file per area, server-only), and the domain function takes their typed output | Hand-written `typeof` checks in each domain function; Zod; parsing at the start of each domain function; each schema in the domain module that uses it | One path turns invalid input into STD-3's `422`, domain functions get typed and already-trimmed input instead of `unknown`, and a malformed body stops being a `500`. Order: session, then schema, then the domain's role check, then database rules, then the write. A signed-out caller always gets `401` and learns nothing about the body; invalid input fails before the role check and any domain query. A signed-in member without the role who sends an invalid body therefore gets `422`, not `403`; the schema reveals only the request's shape, which the browser code already shows. Lengths count characters (code points) as the spec and Postgres do, not UTF-16 units. One folder puts every input rule in one place to read and review, and keeps the schemas apart from database code. |
| D-43 | Routes only authenticate. Every domain function called from a signed-in route takes the member as `actor` first and owns every role and ownership check, with `assertAdmin` before any lookup ([ADR 0001](ADRs/0001-permission-checks-in-domain.md)) | `apiRoute("admin")` checking the role in the route; admin-only functions typed `actor: Admin`; an `adminOnly` wrapper | Reading a domain file must show its permission rules: with the role in the route, `createProject` looked open to anyone while `updateProject` checked. Typing `actor: Admin` would push the narrowing back into the route. Nothing at typecheck enforces `assertAdmin`, so each admin-only function has a 403 test. Every admin route declares a body schema (M12.2), so a member's malformed JSON gets `422` from `apiRoute` before the domain's `403`, never a `500`. |
