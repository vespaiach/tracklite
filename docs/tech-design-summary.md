# Tracklite: Technical design in brief

A short, human-readable summary of [`tech-design.md`](tech-design.md). It leaves out detail on purpose. If the two disagree, `tech-design.md` wins (and the spec wins over both).

## The big picture

Tracklite is a small issue tracker for one invite-only team of about 15 people. It is built to be cheap and boring to run: **one PostgreSQL database and nothing else**. No Redis, no paid queue, no extra services.

One process runs: **the web app** (`next start`, behind a reverse proxy). It renders the pages, runs their server actions, and has a few routes for outside callers. Once a minute the deployment's scheduler calls one of them, the **outbox run**, which sends notification emails and cleans up old data. There is no separate worker.

The app talks only to PostgreSQL. Email goes out through Resend in production, Mailpit on a developer's machine, and an in-memory outbox in tests. Servers, the proxy, the scheduler, deploys and backups are managed outside this repository.

The code is moving to this design in batch H of the execution plan; until it's done, the older browser-rendered screens and their `/api` routes still run beside the new pages.

## Pages

Pages are **rendered on the server** with Next.js's App Router. A page reads its data on the server and arrives ready to show; nothing is cached between requests, so every page shows current data. Changes go through **server actions**, and after one succeeds the page renders again with fresh data.

Why: less code and state in the browser, and still one path for permissions, because pages and actions call the same server code.

In the browser:

- Small client components handle forms, pickers, toasts and the board's drag and drop. There is no client-side data store.
- **Board moves are optimistic**: the card moves at once and snaps back if the server refuses.
- Each part of a page loads and fails on its own, with "Couldn’t load …" and **Try again**.
- Leaving a page with unsent text asks first (for links and closing the tab).
- Filters, search and sort live in the URL, so they can be shared and bookmarked. Unsaved form text lives in the form itself.

## How a request is handled

Every server action goes through the same steps, in order (pages and routes do the same checks):

1. Next.js refuses an action called from another website.
2. Check who is signed in. This step only answers "who are you?", never "are you allowed?".
3. Check the input has the right shape; bad input is refused straight away.
4. Call one **use case**. It decides permissions (is this an admin, is this your comment), loads what it needs, lets the domain objects apply the business rules, and saves. The change and the events it causes are saved together, or not at all.
5. Return any refusal as a kind and a message. All user-facing wording for server outcomes lives on the server; the browser shows it as-is. Anything unexpected is passed on to Next.js, which logs it.
6. Write one log line.

Why permissions live in the use cases and not in the pages: reading a use case file shows exactly who may do what, next to the rules it protects.

## How the server code is organised

The server is split into **layers**, and each layer into the same five **bounded contexts**: `identity` (people, sign-in, invitations), `projects` (projects and labels), `issues`, `comments` and `notifications`.

- **Domain**: the rules, as classes. An `Issue` knows how to be created, moved or assigned and refuses what the spec forbids. No database, no framework, so it's tested on its own.
- **Application**: one file per use case ("update an issue"). It loads through repository interfaces and saves inside a **unit of work**, one transaction that also stores the events the change raised.
- **Infrastructure**: the database tables, the repositories that implement those interfaces, email, logging and config.
- **Queries**: the reads behind pages (the board, lists, an issue page). They skip the domain and query the database directly, because showing data changes nothing and needs no rules.

An automated test fails the build if a layer imports something it shouldn't, such as the domain importing the database. Each context still owns its own tables.

When something happens that someone should hear about (an assignment, a mention), the domain records an **event**. The unit of work stores it in an outbox table in the same transaction, and the outbox run turns it into notifications.

## Data

- PostgreSQL 18, accessed through Drizzle ORM. Every time is stored with its time zone (UTC).
- **The database clock is the only clock.** Every "has this expired?" check uses the database's `now()`, never the app server's clock.
- Secret tokens (invitations, password resets, sessions) are stored only as hashes.
- Issue numbers (`WEB-42`) are never reused, project keys are reserved forever, and members are never deleted, only deactivated.
- Board order uses sortable text keys, so moving one card changes only that card.
- Search finds any word in an issue's title, description or ID, kept fast with trigram indexes.

## Notifications and email

- **Invitations and password-reset emails** are sent during the request. If the send fails, nothing is saved and the user is told to try again, so no working link exists that nobody received.
- **Notifications** (you were assigned, you were mentioned) start as events in the outbox. Several notifications about the same issue within 2 minutes are combined into one email, sent 2 to 3 minutes after the first.
- The **outbox run**, once a minute, turns waiting events into notifications, sends the ones that are due, and once an hour cleans up. Just before sending, it re-checks whether each notification is still wanted (you might have been unassigned meanwhile). Failed sends retry after 1, 4 and 10 minutes, then give up.
- Emails can be sent twice if a run dies at the wrong moment, but Resend drops the duplicate.
- Email is one **channel**. Adding another (such as phone push) means adding a sender and a setting, without touching the queue.
- Bounced emails come back through a signed webhook and show up as Bounced.

## Security

- Passwords are hashed with Argon2id. Sessions are an `HttpOnly`, `Secure` cookie that lasts 30 days from last activity.
- Sign-in and password-reset requests are rate-limited per email and per IP address.
- Writes from other websites are refused: Next.js checks where an action came from, and the session cookie isn't sent on cross-site posts.
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

- **PostgreSQL as the queue**, drained by a once-a-minute route, instead of a queue service or a worker process: one thing to run, nothing to pay for.
- **Server-rendered pages** with server actions, instead of loading everything in the browser: less client code, current data on every page.
- **Resend** for email: its free plan fits the budget and it signs webhooks.
- **Use cases own permissions**; pages and actions only check who you are.
- **Classes for the domain model**, with value objects and recorded events, following the owner's DDD article.
- **Repository interfaces** so the use cases don't depend on the database code, but no in-memory fakes: tests still run against a real database.
- **One read side** for screens instead of each context reading across others.
- **Last save wins** for issue fields; only descriptions and comments warn you if someone else saved first.
