# Tracklite: Technical design in brief

A short, human-readable summary of [`tech-design.md`](tech-design.md). It leaves out detail on purpose. If the two disagree, `tech-design.md` wins (and the spec wins over both).

## The big picture

Tracklite is a small issue tracker for one invite-only team of about 15 people. It is built to be cheap and boring to run: **one PostgreSQL database and nothing else**. No Redis, no paid queue, no extra services.

Two processes run from the same codebase:

- **The web app** (`next start`, behind a reverse proxy) serves the browser app and the API.
- **The worker** (a small Node script) sends notification emails and cleans up old data.

Both talk only to PostgreSQL. Email goes out through Resend in production, Mailpit on a developer's machine, and an in-memory outbox in tests. Servers, the proxy, deploys and backups are managed outside this repository.

## The browser app

Tracklite is a **strict single-page app**. Every page address returns the same HTML shell, and the browser does everything else: routing, redirecting signed-out visitors, and loading all data through the API. The server never renders data into pages.

Why: every read and write goes through the same API and the same permission checks, so there is one path to secure and test.

Inside the browser:

- **React Router** handles pages. It also gives the "you have unsaved text" prompt when leaving a page.
- **Redux Toolkit / RTK Query** holds all data from the server. Each screen fetches fresh data when it opens; there is no polling and no live updates.
- **Board moves are optimistic**: the card moves at once and snaps back if the server refuses.
- Filters, search and sort live in the URL, so they can be shared and bookmarked. Unsaved form text lives in the form itself.

## How a request is handled

Every API call goes through the same steps, in order:

1. Refuse writes coming from another website.
2. Check who is signed in. This step only answers "who are you?", never "are you allowed?".
3. Check the request body has the right shape; bad input is refused straight away.
4. Call one function in the domain code. **That function decides permissions** (is this an admin, is this your comment), applies the business rules, and saves. The action and any notifications it causes are saved together, or not at all.
5. Turn any refusal into the right HTTP status with a message. All user-facing wording for server outcomes lives on the server; the browser shows it as-is.
6. Write one log line.

Why permissions live in the domain and not in the routes: reading a domain file shows exactly who may do what, next to the rules it protects.

## How the server code is organised

The server is split into **bounded contexts**, one folder each: `identity` (people, sign-in, invitations), `projects` (projects and labels), `issues`, `comments` and `notifications`. Each context has one public entry file, owns its own tables, and may only depend on certain other contexts. An automated test fails the build if these rules are broken.

Within a context, the code follows a simple pattern: **load → decide → save**.

- The decisions ("can this issue be deleted?", "who is newly assigned?") are plain functions with no database, so they are easy to test.
- Loading and saving are separate functions that talk to the database.
- A use case ("update an issue") ties these together inside one transaction.

Reads for screens (the board, lists, an issue page) skip all that and query the database directly from a separate read-side folder, because showing data changes nothing and needs no rules.

When something happens that someone should hear about (an assignment, a mention), the context announces it as an **event**, and the notifications context reacts by writing notification rows in the same transaction.

## Data

- PostgreSQL 18, accessed through Drizzle ORM. Every time is stored with its time zone (UTC).
- **The database clock is the only clock.** Every "has this expired?" check uses the database's `now()`, never the app server's clock.
- Secret tokens (invitations, password resets, sessions) are stored only as hashes.
- Issue numbers (`WEB-42`) are never reused, project keys are reserved forever, and members are never deleted, only deactivated.
- Board order uses sortable text keys, so moving one card changes only that card.
- Search finds any word in an issue's title, description or ID, kept fast with trigram indexes.

## Notifications and email

- **Invitations and password-reset emails** are sent during the request. If the send fails, nothing is saved and the user is told to try again, so no working link exists that nobody received.
- **Notifications** (you were assigned, you were mentioned) are queued as rows in the database. Several notifications about the same issue within 2 minutes are combined into one email.
- The **worker** checks the queue every 5 seconds. Just before sending, it re-checks whether each notification is still wanted (you might have been unassigned meanwhile). Failed sends retry after 1, 4 and 10 minutes, then give up.
- Emails can be sent twice if the worker crashes at the wrong moment, but Resend drops the duplicate.
- Email is one **channel**. Adding another (such as phone push) means adding a sender and a setting, without touching the queue.
- Bounced emails come back through a signed webhook and show up as Bounced.

## Security

- Passwords are hashed with Argon2id. Sessions are an `HttpOnly`, `Secure` cookie that lasts 30 days from last activity.
- Sign-in and password-reset requests are rate-limited per email and per IP address.
- Writes from other websites are refused by checking where the request came from.
- Markdown is rendered without raw HTML, and only `http`, `https` and `mailto` links work.
- A strict Content Security Policy allows only the app's own scripts, styles and fonts; nothing loads from a CDN.
- The very first admin is created in the browser with a long setup secret from server config.

## Errors and logs

- Each error is logged **once**, by the code that decides what to do about it (answer with an error, retry, or crash screen). Expected refusals, such as "not allowed", are not errors and are not logged.
- Logs are one JSON line per event and never contain passwords, tokens, email addresses, or the text of issues and comments.
- Crashes in the browser are reported to the server, rate-limited, and logged the same way.

## Screens

Behaviour and wording come from the spec, and every screen's look comes from the design export in `docs/design/` (the Docket design system). The board uses accessible drag and drop that also works by keyboard and screen reader.

## Key decisions, in one line each

- **PostgreSQL as the queue**, with a separate worker, instead of a queue service: one less thing to run or pay for.
- **Single-page app** instead of server-rendered pages: one path for data and permissions.
- **Resend** for email: its free plan fits the budget and it signs webhooks.
- **Domain code owns permissions**; routes only check who you are.
- **Plain functions instead of classes** for the domain model: simpler to test, and consistent with the rest of the code.
- **No repository interfaces or fakes**: tests run against a real database, so fakes would only test themselves.
- **One read side** for screens instead of each context reading across others.
- **Last save wins** for issue fields; only descriptions and comments warn you if someone else saved first.
