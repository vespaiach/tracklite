# Tracklite: Technical design

Companion to `docs/tracklite-spec.md` (v0.10). The spec says *what* the product does; this file records only the technical decisions the spec leaves open. If they disagree, the spec wins and this file gets fixed.

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
2. Validate the session with `requireMember`, then the role with `requireAdmin` where needed. Together these are the single permission layer (spec §12).
3. Call one domain function in `src/server/`, passing a transaction. The action and any notification rows it creates commit together (spec §12).
4. Map a thrown `ApiError` to `401`/`403`/`404`/`422`/`429`/`503` with `{ error: { message, fields? } }`. Map anything else to `500`.
5. Write one JSON log line per request, without bodies or tokens (SEC-007).

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

All email goes through one `sendEmail()` module with three implementations:
- **production:** the provider's HTTP API;
- **development:** Mailpit's HTTP send API (`:8025`);
- **tests:** an in-memory outbox that tests can inspect.

### 1.6 Configuration

- Settings come from environment variables: `.env.local` in development, and `/etc/tracklite/env` on the VPS (mode `600`, outside the release directory, OPS-006).
- Both processes check them at startup and refuse to start if any are missing.
- Settings: `DATABASE_URL`, `APP_URL` (for links in emails), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `EMAIL_FROM` (section 5).
- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are required only when `NODE_ENV` is `production`; development sends through Mailpit and tests through the in-memory outbox (5.6).
- Tests run against `TEST_DATABASE_URL`, which must differ from `DATABASE_URL`. Before each run its schema is dropped and the migrations applied afresh.

### 1.7 Browser app (single-page app)

Strict single-page app, as the Next.js docs define it: the app is served by one HTML document, and every route change, page transition and data fetch happens in the browser, with no full-page reloads.

**The shell.**
- `src/app/layout.tsx` holds `<html>`, `<body>`, the fonts (`next/font/google`, served from the app so the CSP's `font-src 'self'` holds) and the Track Lite stylesheet.
- One optional catch-all page, `src/app/[[...path]]/page.tsx`, renders `<ClientApp />` through `next/dynamic` with `ssr: false`. It's the same document for every address.
- `/api`, `/health` and `/webhooks` are more specific routes, so they're never caught by it.
- `src/proxy.ts` only sets the Content Security Policy (4.9). It doesn't redirect pages; the browser app does.

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

**Redux Toolkit.** One store, created once in `ClientApp`.

- **RTK Query** (`createApi`, one `api` slice) holds all server data. The `baseQuery`:
  - wraps `fetch`, sends JSON and parses `{ error: { message, fields? } }`;
  - on `401`, redirects to sign-in;
  - leaves every other error to the component, which shows field errors (STD-3), an editor conflict (`409`, STD-8), or a toast.
- **Fresh data on every visit.** Queries use `refetchOnMountOrArgChange: true`, so each screen loads current data when opened. That matches "pages show current data when they load" (spec §12). There's no `refetchOnFocus` and no polling: no live updates in R1, and REQ-041.6 expects an open page to stay as it is.
- **Tags drive refreshing.** For example, `updateIssue` invalidates `Issue(ID)`, `Board(KEY)`, `IssueList(KEY)` and `MyIssues`. A mounted screen showing that data then refetches.
- **Optimistic board moves (NFR-005, REQ-026).** `moveIssue` updates the cached board in `onQueryStarted` before the request goes out. If the request fails, it undoes the change and shows the toast "Couldn't move WEB-42". If it succeeds, it invalidates `Board(KEY)`, which refreshes the columns involved.
- **UI slice:** one `toast` slice (STD-9: one message at a time, 5 seconds, no dismiss).
- **Kept out of Redux on purpose:**
  - list-view filters, search and sort live in the URL (`useSearchParams`), since REQ-040 already makes the URL their home;
  - form drafts live in component state.

**Request IDs (STD-5).** A create form generates `crypto.randomUUID()` once, when the form opens or is reset, and reuses it for every retry of that submit.

**Loading states (STD-7).** One shared hook shows the loading indicator only after a request has been pending for 300 ms.

## 2. Schema

PostgreSQL via Drizzle ORM, connected through the `postgres` (postgres.js) driver (`drizzle-orm/postgres-js`). The schema is `src/server/schema.ts`; `drizzle-kit generate` writes migrations to `migrations/`. Every table has `id uuid primary key default gen_random_uuid()` unless stated, and every timestamp is `timestamptz` in UTC (DATA-003). "FK → x, cascade" means `on delete cascade`.

### 2.1 Enums

| Enum | Values, in declared order | Why the order matters |
|---|---|---|
| `role` | `admin`, `member` | — |
| `issue_status` | `backlog`, `in_progress`, `in_review`, `done`, `canceled` | Postgres sorts enums by declared order, so `ORDER BY status` gives the REQ-017 order for free (REQ-039). |
| `issue_priority` | `urgent`, `high`, `medium`, `low`, `none` | `ORDER BY priority` gives Urgent first, No priority last (REQ-039, REQ-042). |
| `label_color` | 8 values | Each maps to Track Lite colour tokens in section 6.6. |
| `notification_kind` | `assigned`, `mentioned` | — |
| `email_state` | `pending`, `sent`, `dropped`, `failed`, `bounced` | — |

### 2.2 Accounts and sign-in

**`members`**: `email`, `full_name`, `username`, `password_hash`, `role`, `deactivated_at` (null = active), `created_at`.
- Unique indexes on `lower(email)` and `username`. Usernames are lowercased before saving (REQ-003.1), so a plain unique index on `username` is enough.
- Check that `username` matches `^[a-z0-9-]{2,20}$`.
- Never deleted (section 8 of the spec), so foreign keys pointing at members use the default `restrict`.
- **Keeping the last admin (REQ-007.3, REQ-052.3).** Removing admin or deactivating first locks every active admin row (`select id from members where role = 'admin' and deactivated_at is null for update`), then refuses if the target is the only one. Two admins demoting each other at once are serialised by the lock, so the second sees one admin left and is refused.
- **Role changes apply on the next request (REQ-052).** `requireMember` reads the role from the database on every request; nothing caches it in the session.

**`invitations`**: `email`, `invited_by` (FK → members), `token_hash` (unique), `expires_at`, `accepted_at`, `revoked_at`, `bounced_at`, `provider_message_id`, `created_at`.
- The spec's state is derived, not stored: Accepted if `accepted_at` is set, Revoked if `revoked_at` is set, Bounced if `bounced_at` is set, Expired if `expires_at < now()`, otherwise Pending.
- `provider_message_id` is the Resend ID of the latest email, so the bounce webhook can find the invitation (5.4). A resend replaces it and clears `bounced_at`.
- Partial unique index on `lower(email)` where `accepted_at is null and revoked_at is null`, so an email has at most one open invitation. Inviting an email again replaces that row's `token_hash` and `expires_at`, which is how a resend works (REQ-001.3). The old link stops working because its hash no longer matches.

**`password_reset_tokens`**: `member_id` (FK → members), `token_hash` (unique), `expires_at`, `used_at`, `created_at`.
- A successful reset sets `used_at` on that row **and** on all the member's other unused rows (REQ-050.6).

**`sessions`**: `member_id` (FK → members), `token_hash` (unique), `last_active_at`, `created_at`.
- A session ends by deleting its row: on sign-out, deactivation (REQ-007), a password change for the member's other sessions (REQ-049), or a reset (REQ-050). DATA-004's 30-day limit is a maximum, so deleting at once complies.
- A session is valid while `last_active_at > now() - 30 days` (REQ-006). To avoid a database write on every request, `last_active_at` is only rewritten when it's more than 1 hour old. At most 1 hour of the 30 days is lost, which is acceptable.

**`sign_in_attempts`** (failed sign-ins and wrong current passwords, REQ-049.3) and **`password_reset_requests`**: `email` (lowercased), `ip` (`inet`), `created_at`, with no `id` column.
- SEC-001 checks count the rows from the last hour, so each table has indexes on `(email, created_at)` and `(ip, created_at)`.
- They're deleted after the retention in DATA-004 (1 hour and 1 day respectively, plus 30 days).

Tokens (SEC-003) are 32 random bytes, sent base64url-encoded, and stored as `sha256` hashes in a `bytea` column. A fast hash is enough here because the token itself has 256 random bits; only passwords need Argon2id (SEC-008).

### 2.3 Projects and labels

**`project_keys`**: `key text primary key`. One row is inserted with every project and is **never deleted**. That's what reserves the key forever (REQ-009.3), while the project row itself can be hard-deleted.

**`projects`**: `key` (unique, FK → project_keys), `name`, `description` (default `''`), `description_version int default 0`, `next_issue_number int default 1`, `archived_at`, `created_at`.
- Check that `key` matches `^[A-Z]{2,5}$`.
- Sidebar order (REQ-015): `order by name, key`.

**`labels`**: `project_id` (FK → projects, cascade), `name`, `color label_color`.
- Unique index on `(project_id, lower(name))` (REQ-021.2).

### 2.4 Issues

**`issues`**: `project_id` (FK → projects, cascade), `number`, `title`, `description` (default `''`), `description_version int default 0`, `status`, `priority`, `assignee_id` (FK → members, null), `position text`, `created_by` (FK → members), `created_at`, `updated_at`, `status_changed_at`, `request_id uuid` (unique).
- Unique on `(project_id, number)`.

How the less obvious columns work:

- **Numbering (REQ-016).** The create transaction runs `update projects set next_issue_number = next_issue_number + 1 where id = $1 returning next_issue_number - 1`. The row lock makes two people creating at the same moment wait for each other, so they get different numbers (REQ-016.4). Deleting an issue never decrements the counter, so numbers aren't reused (REQ-016.2).
- **Board position (REQ-026, REQ-027).** `position` is a string sort key from the `fractional-indexing` package. A drop between two cards generates a key between theirs; "move to top" generates a key before the column's first card. Only the moved row changes, so two members reordering different cards don't conflict (REQ-026.3). Columns sort by `(position, id)`: if two moves land between the same pair at once, they may get equal keys, and `id` breaks the tie consistently for everyone.
- **`updated_at` (REQ-036).** Set when the title, description, status, priority, assignee or the issue's labels change. Not set by reordering within a column (REQ-036.5), comments, or renaming or recoloring a label on the Labels page.
- **`status_changed_at`.** Set on every status change, and drives the 14-day Done/Canceled window (REQ-028, REQ-041).
- **`description_version`.** Incremented on each description save. A save sends the version it started from, and the update runs `where description_version = $sent`. If no row matches, someone else saved first → the STD-8 conflict message. Changes to other fields don't touch it, so a status change by a teammate never blocks your description save. Projects use the same pattern.
- **`request_id`.** A create that repeats a `request_id` returns the existing issue (STD-5).

Indexes:
- `(project_id, status, position)` for the board.
- `(project_id, updated_at desc)` for the list's default sort.
- `(assignee_id, status)` for My issues.
- GIN `gin_trgm_ops` on `title` and on `description` for search.

**`issue_labels`**: `issue_id` (FK → issues, cascade), `label_id` (FK → labels, cascade), primary key `(issue_id, label_id)`.
- The 10-label maximum (REQ-020.3) is checked in the transaction that adds labels, after locking the issue row.

**Search (REQ-038).** One condition per typed word, combined with `and`. The issue matches if the word appears in the title, the description, or its ID (`key || '-' || number`), each checked with `ILIKE '%word%'`, where `%`, `_` and `\` in the word are escaped first (REQ-038.4). The `pg_trgm` indexes keep this fast at 10,000 issues (NFR-004).

### 2.5 Comments and mentions

**`comments`**: `issue_id` (FK → issues, cascade, null), `project_id` (FK → projects, cascade, null), `author_id` (FK → members), `body`, `version int default 0`, `created_at`, `edited_at`, `request_id uuid` (unique).
- Check `num_nonnulls(issue_id, project_id) = 1`: each comment belongs to exactly one issue or one project.
- Indexes on `(issue_id, created_at)` and `(project_id, created_at)`.

**`mentions`**: `member_id` (FK → members), `issue_id` (FK → issues, cascade, null), `project_id` (FK → projects, cascade, null), `comment_id` (FK → comments, cascade, null).
- `issue_id` is used for a mention in an issue's description, and `project_id` for one in a project's description (REQ-044).
- Check `num_nonnulls(issue_id, project_id, comment_id) = 1`, plus unique indexes on `(member_id, issue_id)`, `(member_id, project_id)` and `(member_id, comment_id)`.
- The rows always mirror the **current** text. Each save parses the mentions (DATA-001), inserts the new ones and deletes the removed ones. "Mentioned for the first time" (REQ-044) means "not in the text before this save". So if a mention is removed and later added back, that member is emailed again, as the spec requires (REQ-044).

### 2.6 Notifications

Two tables. One holds the notifications; the other holds the emails they're combined into (REQ-045).

**`notification_emails`**: `recipient_id` (FK → members), `target_type` (`issue` | `project`), `target_id uuid` (**no FK**), `send_after`, `state email_state`, `attempts int default 0`, `next_attempt_at`, `provider_message_id`, `created_at`, `sent_at`.
- The worker picks up rows with `state = 'pending' and coalesce(next_attempt_at, send_after) <= now()`.
- The webhook finds a bounced email by its `provider_message_id` (API-003).

**`notifications`**: `email_id` (FK → notification_emails, cascade), `kind`, `actor_id` (FK → members), `comment_id uuid` (no FK, null), `dropped boolean default false`, `created_at`, plus a **snapshot** of what the email needs: issue ID text, issue title, project name and key, link path, and a plain-text excerpt of up to 500 characters.

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
- **DATA-004 cleanup:** a daily job deletes rows older than their retention period, using `now() - interval`. These are among the few queries written in raw SQL.

## 3. API

Settles DEC-002. Request and response types live in the code; this section fixes paths, permissions and errors.

### 3.1 Conventions

- **Format.** JSON in and out. Times are ISO 8601 strings in UTC (DATA-003).
- **Addressing.** Issues by ID (`WEB-42`), projects by key (`WEB`), and members by username. All are matched ignoring capitals (REQ-016.5). Labels, comments and invitations use their `uuid`.
- **No tokens in paths.** Invitation and reset tokens always travel in the request body. The request log records only the path, never the query string, so the `?token=` on the reset *page* (API-004) isn't logged either (SEC-007).
- **Field-by-field saves.** The issue page saves each field as soon as it changes, with a `PATCH` that holds only that field. That's what makes STD-8's "last save wins" work per field. It also means one failed field leaves the others saved (REQ-020.4).
- **Creating twice.** Creates of issues and comments carry `requestId`. A repeat returns the first result with `200` instead of `201` (STD-5).
- **Small member data.** A member appears in responses as `{ username, fullName, initials, deactivated }`. Emails appear only on `/api/me` and the admin member list. Password hashes never appear (SEC-008.2).

### 3.2 Errors

Every error body is `{ error: { message, fields? } }`, and the browser shows `message` as-is. That keeps all user-facing copy for server-side outcomes in one place.

| Status | When | Browser shows |
|---|---|---|
| `401` | No valid session: signed out, expired or deactivated (STD-1, REQ-007.4) | Redirect to `/sign-in?next=…` |
| `403` | Not allowed (STD-2), a cross-site write (SEC-004), or a write to an archived project, with the message "This project is archived" (REQ-013.4) | Toast (STD-9) |
| `404` | The target doesn't exist. The message names it: "Not found", "This issue was deleted", "This comment was deleted", "That label no longer exists" | Not-found page on load (STD-4); toast on save (STD-9) |
| `409` | Stale save of a description or comment: "This was changed by Alex Kim. Copy your text and reload." (STD-8) | Message in the editor; text kept |
| `410` | An invitation or reset link that's expired, used or revoked (REQ-002.2, REQ-002.4, REQ-050.4) | The page's expired state |
| `422` | Invalid input. With `fields`: one error per field (STD-3). Without `fields`: a form-level refusal, such as "Already a member", "There must be at least one admin." or "Incorrect email or password." | Next to the fields, or beside the form |
| `429` | A SEC-001 limit: "Too many attempts. Try again later." | Beside the form |
| `503` | An invitation or reset email couldn't be sent (STD-6) | Toast |
| `500` | Anything else | Toast "Couldn't save. Try again." or the "Couldn't load this." state (DEC-006) |

Changing a field that can't be changed (username, email, project key) gets `422` with a field error. The stored value stays as it was (REQ-003.3, REQ-010.1).

### 3.3 Endpoints

"Member" means any signed-in active member. Every write to something inside an archived project (its description, issues, comments, labels) gets `403` "This project is archived". Admins can still rename, unarchive or delete an archived project.

**Sign-in and account** (no session needed unless noted)

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `POST /api/sessions` | `{ email, password }` → `204`, sets the cookie | Anyone | REQ-047, SEC-001 |
| `DELETE /api/sessions/current` | → `204`, with or without a session | Anyone | REQ-006 |
| `POST /api/password-reset-links` | `{ email }` → `204` whether or not the email belongs to a member | Anyone | REQ-050, SEC-001 |
| `POST /api/password-reset-lookups` | `{ token }` → `204`, or `410` "This link has expired". Doesn't use up the link | Anyone | REQ-050.5, REQ-050.9 |
| `POST /api/password-resets` | `{ token, password }` → `204`. Ends all the member's sessions, then sets a new cookie | Anyone | REQ-050 |
| `POST /api/invitation-lookups` | `{ token }` → `{ email }`, or `410` with the same messages as accepting | Anyone | REQ-002 |
| `POST /api/members` | `{ token, fullName, username, password }` → `201`, sets the cookie (accepting an invitation) | Anyone | REQ-002, REQ-003 |
| `GET /api/me` | → profile, including email and role | Member | REQ-003.3 |
| `PATCH /api/me` | `{ fullName }` | Member | REQ-003 |
| `PUT /api/me/password` | `{ currentPassword, newPassword }` → `204`. Ends the member's other sessions | Member | REQ-049 |

**Members and invitations**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/members` | → all members, active and deactivated. Used for the assignee picker, the @mention suggestions and the members page. With about 15 people, the browser filters the list itself. | Member (emails only for admins) | DATA-001, REQ-037 |
| `PATCH /api/members/{username}` | `{ role?, deactivated? }` | Admin | REQ-007, REQ-008, REQ-052 |
| `GET /api/invitations` | → invitations that are Pending, Bounced or Expired | Admin | REQ-001, REQ-051 |
| `POST /api/invitations` | `{ email }` → `201`. If an open invitation for that email exists, this works as a resend | Admin | REQ-001 |
| `POST /api/invitations/{id}/resend` | → `200`, new link | Admin | REQ-001.3 |
| `DELETE /api/invitations/{id}` | → `204`, revoked | Admin | REQ-001.4 |

**Projects and labels**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/projects?archived=false\|true` | → sidebar list, or the Archived list | Member | REQ-013, REQ-015 |
| `POST /api/projects` | `{ name, key }` → `201` | Admin | REQ-009 |
| `GET /api/projects/{KEY}` | → name, key, description, `descriptionVersion`, mentions, `archivedAt` | Member | REQ-046 |
| `PATCH /api/projects/{KEY}` | `{ name? }` or `{ archived? }` (Admin), `{ description, descriptionVersion }` (Member) | Per field | REQ-011, REQ-012, REQ-013 |
| `DELETE /api/projects/{KEY}` | → `204`. The typed-key confirmation is checked in the browser | Admin | REQ-014 |
| `GET /api/projects/{KEY}/labels` | → labels sorted by name ignoring capitals, each `{ id, name, color, issueCount }` | Member | REQ-021, REQ-021.5 |
| `POST /api/projects/{KEY}/labels` | `{ name, color }` → `201`, the label | Member | REQ-020.2, REQ-021 |
| `PATCH /api/labels/{id}` | `{ name?, color? }` → the label. A missing label gets `404` "That label no longer exists" | Member | REQ-021 |
| `DELETE /api/labels/{id}` | → `204` | Member | REQ-021.3 |

**Issues and views**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/projects/{KEY}/board` | → 5 columns in order, each with cards and a count. Done and Canceled hold only issues moved there in the last 14 days | Member | REQ-024, REQ-025, REQ-028 |
| `GET /api/projects/{KEY}/issues` | Query: `status`, `assignee`, `priority`, `label` (each repeatable), `q`, `sort`, `dir`, `offset` → 100 rows plus `hasMore`. Unknown values are ignored | Member | REQ-036…040 |
| `POST /api/projects/{KEY}/issues` | `{ requestId, title, status? }` → `201`. `status` is used by the column **+** buttons | Member | REQ-016, REQ-029 |
| `GET /api/issues/{ID}` | → the issue with its labels, assignee, creator, `descriptionVersion` and mentions | Member | REQ-016 |
| `PATCH /api/issues/{ID}` | One of `{ title }`, `{ status }`, `{ priority }`, `{ assignee }` (username or `null`), `{ labelIds }`, or `{ description, descriptionVersion }` | Member | REQ-016…022, REQ-027.4 |
| `PUT /api/issues/{ID}/position` | `{ status, place: "top" \| "bottom" \| { after: "WEB-5" } }` | Member | REQ-026, REQ-027, REQ-030 |
| `DELETE /api/issues/{ID}` | → `204` | Creator or Admin | REQ-023 |
| `GET /api/my-issues` | → the member's issues, grouped by status | Member | REQ-041, REQ-042 |

**Comments**

| Method and path | Body → result | Who | Spec |
|---|---|---|---|
| `GET /api/issues/{ID}/comments`, `GET /api/projects/{KEY}/comments` | → every comment, oldest first, each with its mentions | Member | REQ-032 |
| `POST /api/issues/{ID}/comments`, `POST /api/projects/{KEY}/comments` | `{ requestId, body }` → `201` | Member | REQ-031 |
| `PATCH /api/comments/{id}` | `{ body, version }` | Author | REQ-033 |
| `DELETE /api/comments/{id}` | → `204` | Author or Admin | REQ-034 |

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
- **Unknown emails.** No dummy hash is computed for an email that isn't a member. The timing difference is an accepted limitation in spec §10.

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

Anything else gets `403`. `SameSite=Lax` is a second layer of protection. The one exception is `/webhooks/email`, which is checked by signature instead (3.3).

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

**Accepting an invitation** (`POST /api/members`). In one transaction:
1. Lock the invitation found by hash (`for update`).
2. Answer `410` with the right message if needed:
   - revoked → "This invitation is no longer valid." (REQ-002.4);
   - expired, already accepted, or unknown (including a link replaced by a resend) → "This invitation has expired. Ask an admin for a new one." (REQ-002.2).
3. Validate the profile and password (`422`).
4. Insert the member, set `accepted_at`, create a session.

If the request arrives with a valid session, it's refused with `403` "You're signed in as {name}. Sign out to accept this invitation." The page shows that state before the form appears (REQ-002.3). This check just stops a bypass through the API.

**Resetting a password** (`POST /api/password-resets`). In one transaction:
1. Lock the token row.
2. Answer `410` "This link has expired" if it's used, expired, unknown, or the member is deactivated.
3. Validate the new password (`422`).
4. Set the hash, set `used_at` on **all** the member's unused tokens (REQ-050.6), delete the member's sessions, and create a new one.

**Opening a reset link** checks the token with `POST /api/password-reset-lookups`, which only reads it. A usable link shows the form; anything else shows "This link has expired" (REQ-050.9). Because the check never uses the link up, a mail scanner opening it changes nothing (REQ-050.5). If a valid session exists, the page shows "You're signed in as {name}. Sign out to reset a password." and never looks at the token (REQ-050.8).

### 4.7 Markdown (SEC-002, DATA-001)

One module, `src/lib/markdown/`, used for both **rendering** in the browser and **finding mentions** on the server. Because both use the same parser, `@sam` inside code is skipped the same way in both places (DATA-001.4).

- **Parser:** `react-markdown` with `remark-gfm` (checklists, tables, strikethrough). `rehype-raw` is never used.
- **Raw HTML.** A small remark plugin turns every `html` node into a `text` node. `<script>` and `<img onerror>` then show as literal text (REQ-012.3, SEC-002.1), rather than depending on a library default.
- **Links.** A `urlTransform` allows only `http:`, `https:` and `mailto:`. A link with any other scheme renders as its plain text, not an `<a>` (SEC-002.2). Allowed links get `target="_blank" rel="noopener noreferrer"`.
- **Mentions.** A remark plugin walks text nodes outside `code` and `inlineCode` and matches `(?<![A-Za-z0-9._%+@-])@([a-z0-9-]{2,20})(?![a-z0-9-])`. The look-behind skips email addresses and `foo@sam`; the look-ahead stops at punctuation, so `(@sam)` and `@sam, thanks` both match (DATA-001.5, DATA-001.6). Mentions are found in issue descriptions, project descriptions and comments.
  - On the server, the matches become the `mentions` rows: active members only (2.5).
  - In the browser, a match is shown highlighted, with the full name on hover, only if the username is in the `mentions` list from the API (1.2). Mentions aren't links (DATA-001).

### 4.8 Logs (SEC-007)

- The logger takes a fixed set of fields: time, level, event, method, path (without the query string), status, duration, member username, and error class or message.
- It never logs request or response bodies, headers or cookies.
- Domain events are logged as short phrases, such as `sign-in, member sam` (SEC-007.1).
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

It also sets `Referrer-Policy: same-origin`, so SEC-010 holds even without Caddy. Next.js reads the nonce from the request and adds it to its own scripts; the root layout awaits `connection()` so the shell is rendered per request. A nonce makes the shell render per request instead of being cached, which costs nothing here because there's one small shell.

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

**Risk: the 100/day cap.** A team of under 15 with 2-minute combining should stay well below it, but a very busy day could hit it. Sends over the cap fail and are retried like any other failure, so a notification can end up `failed`, and an invitation or reset shows STD-6's "We couldn't send the email". If that ever happens, the fix is a paid plan or Amazon SES. The `sendEmail()` module (1.5) is the only code that would change.

Postmark was rejected because its paid plan (~$15) plus the VPS goes over the $20 budget, and its webhooks aren't signed. Amazon SES is the cheapest at volume, but its bounces come through SNS, which needs an AWS account and much more setup for 15 people.

### 5.2 Sending

`sendEmail({ to, subject, text, idempotencyKey? })`, implemented three ways (1.5).

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

- Send from a subdomain such as `mail.example.com`, so the app's sending reputation is kept apart from the team's normal email.
- Add the SPF and DKIM records Resend gives you, plus a DMARC record (`v=DMARC1; p=none; rua=mailto:…`) to start.
- Register the webhook URL `https://{host}/webhooks/email` for `email.bounced` and copy its secret into `RESEND_WEBHOOK_SECRET`.

### 5.6 Development and tests

- **Development:** `sendEmail()` posts to Mailpit's send API (`http://localhost:8025/api/v1/send`), so every email is visible in Mailpit's inbox. No Resend key is needed locally.
- **Tests:** an in-memory outbox. Tests can make it fail on demand (REQ-001.7, REQ-050 with the service down, the STD-6 retries).
- **Webhook signature:** tested with a known secret and a hand-built signature.

## 6. Screens

Behaviour and copy come from the spec; this section only adds the routes, layout and pages the spec doesn't describe. All components come from the Track Lite design system (`src/components/ui/track-lite/`).

### 6.1 Routes

The API-004 addresses, plus the four marked **new**.

| Route | Screen | Who | Notes |
|---|---|---|---|
| `/sign-in` | Sign in | Signed out | Signed in → `/my-issues`. |
| `/forgot-password` | Request a reset link | Signed out | Signed in → `/my-issues`. |
| `/reset-password?token=…` | Choose a new password | Anyone | Signed in → sign-out prompt (REQ-050.8). |
| `/invite?token=…` **new** | Accept an invitation | Anyone | Signed in → sign-out prompt (REQ-002.3). |
| `/` | — | — | → `/my-issues` (or sign-in). |
| `/my-issues` | My issues | Member | F-007. |
| `/project/{KEY}` | Board | Member | F-004. |
| `/project/{KEY}/list` | List | Member | F-005. Filters in the query string. |
| `/project/{KEY}/detail` | Project details | Member | REQ-046. |
| `/project/{KEY}/labels` | Labels | Member | REQ-021. |
| `/project/{KEY}/settings` **new** | Project settings | Admin | 6.3. |
| `/projects/archived` **new** | Archived projects | Member | 6.3. |
| `/issue/{ID}` | Issue | Member | 6.4. |
| `/settings/profile` **new** | Profile | Member | 6.3. |
| `/settings/members` | Members and invitations | Admin | 6.3. |
| anything else | Not found (STD-4) | Anyone | |

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

**Sign in.** Email, password, **Sign in**, and a **Forgot password?** link. Errors appear beside the form (REQ-047, SEC-001).

**Forgot password.** Email and **Send link**, then "Check your email" (REQ-050).

**Reset password.**
- A new-password field and **Set password**.
- The expired state shows "This link has expired" with a **Request a new link** button that goes to `/forgot-password` (REQ-050.4).

**Accept invitation.**
- The invited email, shown and not editable.
- Full name, username, password, and **Join Tracklite**.
- Expired and "no longer valid" states show their REQ-002 messages, with no form.

**Profile.**
- Full name with **Save**.
- Username and email shown, not editable.
- A **Change password** form: current password, new password, **Change password**. On success: "Password changed. You've been signed out everywhere else."

**Members** (admin).
- **Invite:** an email field and **Send invitation**.
- **Invitations:** a table of email, invited by and state (Pending, Bounced, or Expired with its date), with **Resend** and **Revoke** actions (REQ-051). Revoke asks for confirmation.
- **Members:** a table with initials and name, username, email, role and status, sorted by name. Each row has a **⋯** menu with **Make admin** / **Remove admin** and **Deactivate**; a deactivated member's menu has only **Reactivate** (REQ-051). Deactivate asks for confirmation ("Sam Lee will be signed out and can't sign in until reactivated.").
- Deactivated members stay in the table, marked "(deactivated)".

**Project settings** (admin).
- Name with **Save**; the key shown, not editable.
- **Archive project** / **Unarchive project**.
- **Delete project:** a confirmation dialog where the Delete button stays disabled until the key is typed exactly (REQ-014).

**Archived projects.**
- A list of archived projects: "Name · KEY" and the archived date. Clicking one opens its board, which is read-only.
- The empty state reads "No archived projects."

**New issue.**
- A dialog with only a title field and **Create**, opened from **New issue** or a column's **+** (REQ-029).
- On success, it goes to the new issue's page, so the description and fields can be filled in straight away.

### 6.4 Issue page

- **Header:** a link back to the project, the issue ID, and the title. The title is edited in place and saved on Enter or when focus leaves it. Escape cancels.
- **Main column:**
  - the description, shown formatted, with an **Edit** button that switches to a Markdown text area with **Save** and **Cancel** (STD-8 conflicts appear here);
  - the comments below it (REQ-032), then the comment box.
- **Side panel:** Status, Priority, Assignee and Labels pickers, each saving as soon as a value is chosen. Then "Created by {name}, {date}", and **Delete issue** for the creator or an admin.
- **Mention suggestions (DATA-001):** typing `@` in the description editor or comment box opens a list of active members, filtered by username or name as the member types. Choosing one inserts `@username`.
- **Unsaved text (REQ-035):** a comment box holding text, or a description editor (issue or project) with unsaved changes, blocks in-app navigation with `useBlocker` and its REQ-035 message, and closing or reloading the tab with `beforeunload`.

### 6.5 Board details

- **Drag and drop:** React Aria Components' `GridList` with `useDragAndDrop`, one list per column, which allows reordering within a column and dropping into another. It comes with keyboard and screen-reader support for free, on top of the **⋯** menu that REQ-030 requires. Automatic scrolling near a column's top or bottom edge (REQ-024) still needs checking in an early spike.
- **Each column scrolls on its own** (REQ-024.3), with the header and counts fixed.

### 6.6 Label colours

The spec's eight colours (REQ-021): `gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`. Each maps to a Track Lite colour token pair (background and text) that meets WCAG AA contrast (NFR-007). The tokens don't yet cover all eight hues, so the mapping is settled when labels are built (M3). Labels created from the picker are `gray` (REQ-020). Deleting a label asks for confirmation, naming how many issues have it (REQ-021.5).

### 6.7 Times

- **Relative times** (REQ-031) come from `Intl.RelativeTimeFormat`: "just now" under a minute, then "5 min ago", "3 hours ago", "2 days ago", up to 7 days.
- **Older dates** show as "Sep 20", or "Sep 20, 2025" when the year isn't the current one.
- **Exact time on hover:** the full date and time in the browser's time zone (DATA-003).

## 7. Decisions

| # | Decision | Over | Because |
|---|---|---|---|
| D-1 | Drizzle ORM (spec 0.9) | postgres.js | Matches the existing setup; typed schema and migrations. |
| D-2 | Fractional string keys for board position | Integer positions with gaps | A move rewrites one row and never needs a renumbering pass. |
| D-3 | `project_keys` table that's never deleted from | Soft-deleting projects | Lets project deletion be a real cascade, as DATA-002 requires. |
| D-4 | Separate version counters for descriptions | One version per row | A field change by a teammate shouldn't cause a description conflict. |
| D-5 | `pg_trgm` + `ILIKE` per word | Postgres full-text search | The spec asks for substring matching (`"42"` → `WEB-42`, `"100%"`), which full-text search doesn't do. |
| D-6 | Notification snapshots with no FKs | FKs to issues/projects | Emails must survive their target being deleted (REQ-045.7). |
| D-7 | Mentions mirror the current text | Keeping every mention ever made | Simpler, and matches REQ-044: removing and re-adding a mention emails again. |
| D-8 | Sessions deleted when they end | Keeping them 30 days with an ended flag | Simpler and safer. DATA-004 sets a maximum, not a minimum. |
| D-9 | Separate worker process polling Postgres with `skip locked` (DEC-004) | A timer inside the Next.js server; pg-boss or similar | A web restart can't interrupt sends, there's no new dependency, and the queue is just a table. |
| D-10 | Strict single-page app: one HTML shell, all page data loaded through the API | Server-rendered pages | Owner's choice. Also gives one code path for permissions and tests. |
| D-11 | Database `now()` for every time check | App-server clock | One clock. Tests move timestamps back instead of faking time. |
| D-12 | Invitation and reset emails sent inside the request | Queuing them | STD-6 needs the send result before answering. |
| D-13 | Caddy as the reverse proxy | nginx | Automatic TLS and HSTS with a few lines of config. |
| D-14 | systemd + journald for processes and logs | pm2, logrotate | Already on the VPS. Retention is one setting. |
| D-15 | Error messages written by the server, shown as-is by the browser | Error codes the browser translates into text | All copy for server-side outcomes in one place, next to the rule that produces it. |
| D-16 | `409` for stale saves, `410` for dead links | Folding both into `422` | The browser needs to tell them apart: an in-editor message vs an expired page. |
| D-17 | Field-by-field `PATCH` on issues | Saving the whole form | Matches "last save wins" per field (STD-8) and the instant saves on the board and issue page. |
| D-18 | Moves name one neighbour (`after`), and the server reads the next card | The browser sending both neighbours' keys | Correct even on a board that's out of date (REQ-026.4). |
| D-19 | Offset paging for the list | Keyset cursors | Sorting by several columns makes cursors complex, and with no live updates offsets are good enough. |
| D-20 | Accepting an invitation is `POST /api/members` | A separate invitations "accept" endpoint | Resource-style: accepting creates a member. |
| D-21 | `@node-rs/argon2` | `argon2` (node-gyp) | Prebuilt binaries; nothing to compile on the VPS. |
| D-22 | `sha256` for tokens | Argon2id for tokens | Tokens have 256 random bits, so a slow hash adds nothing and would make every request slower. |
| D-23 | `Origin` check plus `SameSite=Lax` | CSRF tokens | Covers SEC-004 with no token stored in forms or state. |
| D-24 | HTML nodes turned into text by our own plugin | Relying on react-markdown's default for HTML | The spec requires "shown as text", so we enforce it ourselves rather than depend on a library default. |
| D-25 | One Markdown module for rendering and mention extraction | Separate regex for mentions on the server | `@sam` in code is treated the same everywhere (DATA-001.4). |
| D-26 | Nonce-based CSP set in `src/proxy.ts` (SEC-010) | A CSP without script rules | SEC-010 requires that only the app's own scripts run, and Next.js's inline scripts need a nonce for that. |
| D-27 | React Router (data mode) inside the shell | Next.js routing; hand-rolled `pushState` | One HTML document for every route, plus `useBlocker` for REQ-035. |
| D-28 | Signed-out redirect done in the browser after `GET /api/me` | Redirecting in `src/proxy.ts` (which only sets the CSP) | The server returns the same shell for every address, so one redirect mechanism (in the browser) covers both the first load and a later `401`. |
| D-29 | RTK Query for server data; a `toast` slice for UI | Hand-written slices and thunks | Caching, tags and optimistic updates are built in (REQ-026, NFR-005). |
| D-30 | Refetch on every screen visit, no polling | Long-lived cache | Matches "pages show current data when they load" with no live updates. |
| D-31 | List filters live in the URL, not Redux | Mirroring them in a slice | REQ-040 already makes the URL the source of truth. |
| D-32 | Resend (DEC-003) | Postmark, Amazon SES | Free plan fits NFR-009, signed webhooks, idempotency keys, simple domain setup. |
| D-33 | Plain-text emails only | HTML + text templates | Half the templates; the spec already asks for plain-text excerpts. |
| D-34 | `fetch` + hand-written signature check | Resend SDK, `svix` package | Two small functions instead of two dependencies. |
| D-35 | Combined emails: "{n} updates for you" plus each item | One combined sentence | Works for any mix of assigned and mentioned with one rule. |
| D-36 | React Aria `GridList` drag and drop | dnd-kit | Already in the stack, and accessible by keyboard and screen reader out of the box. Edge auto-scroll to be confirmed in a spike. |
| D-37 | New issue: title-only dialog, then go to the issue | A full create form | Matches REQ-016's flow ("enters a title"); everything else is edited on the issue page. |
| D-38 | Admin-only routes show the STD-2 message, not Not found | Hiding them as Not found | Matches STD-2's wording for actions reached anyway. |
| D-39 | Track Lite design system, ported from its Claude Design project into `src/components/ui/track-lite/` | Hairline; a component library from npm | Made for this product. Fonts load through `next/font` and icons through `@phosphor-icons/react` instead of the project's CDN links, which the CSP (D-26) would block. |
