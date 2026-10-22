# Tracklite: Build plan

Milestones in build order for R1, each split into tasks small enough for one prompt. Behaviour comes from `docs/tracklite-spec.md` (v0.30); the technical design is in `docs/tech-design.md`, referred to below by section number (§).

**Ground rules**
- A task is done when the examples in its **Done** line have passing tests. Name each test after its example, such as `it("REQ-016.4: concurrent creates get distinct numbers")`, so `grep REQ-016` shows how a requirement is covered. `REQ-047.*` means every `Verify: auto` example of REQ-047.
- `npm test`, `npm run lint` and `npm run typecheck` pass at the end of every task.
- A milestone is done when all its tasks are ticked and its **Done when** line holds.
- If the spec turns out to be wrong or silent, fix the spec first (with a changelog line), then the code.

## Working a task

The prompt is one line:

```
Do task M1.3 from docs/build-plan.md.
```

The agent then:
1. Reads the ground rules, this section and the task's entry, and nothing else of this file.
2. Reads only what **Reads** lists. Find a spec rule with `grep -n "REQ-047" docs/tracklite-spec.md` and read the rule with its examples; find a design section by its heading. Open other sections only when a cited one points there.
3. Checks that every task in **Needs** is ticked. If one isn't, it stops and says so. Tasks listed after "API description:" don't need to be ticked (see below).
4. Decides whether the task needs a UI design. It does if it builds or changes something people see in the browser app: a page, dialog, panel, picker or other screen part. API, worker, email-template, operations and throwaway spike tasks don't. If it needs one and **Reads** has no Claude Design link yet, the agent:
   - reads everything related to the screen: the spec rules and design sections in **Reads** (including any other §6 paragraph they point to), `docs/design-system.md`, and the components in `src/components/ui/track-lite/`;
   - fills in prompt 1 from **Tasks with a UI design** below, pasting the rule text and the §6 paragraph in full, and lists any component Track Lite lacks;
   - gives the owner the filled-in prompt and stops without writing tests or code. The task carries on only when the owner hands the design over with prompt 2.
5. Writes the tests for **Done** first, then the code.
6. Stops when **Done** passes and the three checks are green. It doesn't start the next task.
7. Ticks the task's box and commits as `M1.3: sign-in and sign-out API`.

If a task turns out too big for one session, the agent splits it here first (M1.3a, M1.3b, each with its own Reads, Needs and Done) and does only the first part.

Each milestone starts with a **Run order** line. `→` means "after"; tasks joined by `∥` don't depend on each other and can run at the same time. UI tasks test with component tests against a mocked API; the milestone's **Done when** is checked by hand in the browser.

## Running tasks in parallel

- Run each parallel task in its own session and git worktree, branched from the commit where its **Needs** are all ticked.
- Parallel tasks are chosen so they write different files, apart from the shared files a **Run order** line names. Merge them one at a time in the order listed; the later one rebases and resolves any conflict.
- Every task ticks its own box in this file, so merges conflict here trivially. Keep both ticks.
- "Ticked" in step 3 means ticked on the branch the task starts from. Don't start a task whose **Needs** are only done in another unmerged worktree.


## Pages built from the API description

A page task's **Needs** names its API tasks after "API description:". The page doesn't wait for them; it works from their endpoints in design §3.3.
- Design §3.3 lists every endpoint's path, permission and behaviour, but not the shapes of wired-up endpoints: those live in the code. Before either task starts, the first of the pair adds the new endpoints' request and response shapes to §3.3, marked *not wired yet*.
- The page task writes the response types it uses, taken from §3.3, into `src/contract/` (design §3.5), and the RTK Query endpoints it uses, with their request types, in the client code. It tests against mocked responses of those types.
- The API task doesn't touch the client files. Its tests check the response shape against §3.3.
- **Wire-up:** whichever of the pair merges second runs the page against the real API, fixes any mismatch, and makes the domain function return the page's contract type, so `npm run typecheck` keeps them in step from then on. A `satisfies` on the route's return value is optional. It then removes the shapes from §3.3, keeping only what the types can't say. If §3.3 is too vague to type a response, the page task fixes §3.3 first.

## Tasks with a UI design

A task that needs a UI design (step 4 of **Working a task**) is designed in Claude Design before it is coded. The agent writes prompt 1 for it and stops; the design is handed over by adding its link to the task's **Reads** line, so the task still runs from the one-line prompt.

**Order**
1. **Kit first.** If the screen needs a component Track Lite doesn't have, add it to the Track Lite design system project in Claude Design, then import it with the prompt in `docs/design-system.md`. Pages never invent components or styles of their own.
2. **Design the screen** in a Claude Design project that uses Track Lite as its design system, with prompt 1 below. Design all of a milestone's screens in one project so they stay consistent. Give a new project prompt 0 once, before its first prompt 1.
3. **Hand off** with prompt 2 below.

**Rules**
- The spec wins. If the design and the spec disagree, fix the spec first (with a changelog line), then the design, then the code.
- The design gives layout, copy and states. The code builds them from Track Lite components and tokens, never from the design's own markup or inline styles.
- A Claude Design link in **Reads** is read with the DesignSync tool, like any other listed source.

**Prompt 0: shared context (in Claude Design, once per project).** Paste it as is. It holds what every screen shares, so prompt 1 only carries the screen's own rules. Keep it in step with spec §3 and §6 (standard behaviors), design §6.2 and `docs/design-system.md`.

```text
This project designs the screens of Tracklite, release R1. Read this once. Every screen prompt that follows builds on it, and I'll paste each screen's own rules with that prompt.

ABOUT THE PRODUCT
Tracklite is a small issue tracker for one invite-only team of fewer than about 15 people. They found Linear too complex. It keeps issues inside projects, with comments, a kanban board, a list view, My issues and email notifications. English only. Desktop browsers first: phones work but aren't polished.

Not in R1, so never draw these: keyboard shortcuts, shortcut hints or key caps for shortcuts, a command palette, cycles/sprints/roadmaps, sub-issues or issue links, file attachments or images, in-app notifications or notification settings, activity history, search across projects, public sign-up, multiple workspaces or a workspace switcher, two-factor or "Sign in with Google", integrations, data export, live presence or real-time editing.

"Keyboard-first" here means every screen works from the keyboard alone: a sensible tab order, visible focus, Enter submits forms, Escape closes dialogs and menus. It doesn't mean shortcuts.

DESIGN SYSTEM
Use only the Track Lite design system attached to this project. Don't invent components, colours, spacing or one-off styles. If a screen needs something the kit lacks, list it at the end of your answer instead of drawing it.
- Voice: plain, specific, matter-of-fact. Help text uses "you"; the product never says "I" or "we". Sentence case everywhere. Buttons are verbs ("Sign in", "Send link"). Feedback is a past-tense fact. Use the ellipsis character (…) and curly quotes. No exclamation marks, no emoji.
- Machine values in mono: issue IDs, dates, counts, relative times.
- There's no logo: the brand is the word Tracklite in the serif at weight 600.
- Clay accent for interactive and primary. Terracotta only for exceptions: urgent, in progress, overdue, destructive. Never both accents in one small component.
- Separate rows and panels with 1px rules, not boxes. No gradients, imagery, illustrations or motion.
- Use the exact copy I give in quotes. Server messages appear exactly as written.

DOMAIN VOCABULARY
- Members have a full name, a username and an email; their avatar is their initials. Role is admin or member. A deactivated member is shown as "(deactivated)".
- Projects are shown as "Name · KEY", for example "Website · WEB". A project can be archived, which makes it read-only.
- Issues are addressed by ID, such as WEB-42. Statuses, always in this order: Backlog, In Progress, In Review, Done, Canceled. Priorities: Urgent, High, Medium, Low, No priority.

REALISTIC DATA (use these, not lorem ipsum)
- Members: Sam Lee (sam@acme.com, username sam, admin), Alex Kim (alex@acme.com, username alex, member). Add others with acme.com emails as needed.
- Project: Website · WEB. Issues: WEB-42 "Fix login button", WEB-43, WEB-5, WEB-7, WEB-9.

APP STRUCTURE
- Signed-out screens (Sign in, Forgot password, Reset password, Accept invitation) sit outside the app shell, with no sidebar.
- Every signed-in screen uses the same shell. The sidebar, top to bottom: My issues; Projects (active projects as "Name · KEY", with a + for admins that opens New project); Archived projects; Members (admins only); Notifications (admins only); and at the bottom the member's initials and name, opening a menu with Profile and Sign out.
- Project screens (board, list, details, labels) have a header: "Name · KEY" with a details link, Board | List tabs, a Labels link, a settings gear (admins only) and New issue (hidden when archived). Archived projects show an "Archived" badge and no create or edit controls.

STANDARD BEHAVIOURS (every screen follows these, so draw them the same way everywhere)
- STD-1 Not signed in: redirect to sign-in, then back to the page asked for.
- STD-2 Not allowed: actions the member can't take are hidden. If reached anyway: "You don't have permission to do that." in the page area.
- STD-3 Invalid input: the error shows next to the field, the form keeps everything typed, nothing is saved.
- STD-4 Not found: a "Not found" page with a link to My issues.
- STD-5 The submit button is disabled while saving.
- STD-6 If an invitation or password reset email fails: "We couldn't send the email. Try again."
- STD-7 A loading indicator shows only after 300 ms. Empty states name the next action ("No issues yet. Create one."). A load failure shows "Couldn't load this." beside a Retry button.
- STD-9 A failed submission not tied to one field shows a toast that disappears after 5 seconds, with no dismiss or pause control. The form keeps what was typed. For a network or server error the toast reads "Couldn't save. Try again."; otherwise it shows the server's message. One toast at a time.

HOW I'LL ASK
Each screen prompt gives the spec rules with numbered examples, the layout notes and a list of states. Draw each state as its own frame at desktop width, using the data above. Name each frame after its screen and state, for example "Sign in — incorrect password".
```

**Prompt 1: design the screen (in Claude Design).** Fill in the brackets. Paste the rule text itself, not just the IDs, because Claude Design can't read this repo.

```text
Design the [screen name] screen for Tracklite (build-plan task [M2.5]), using only the Track Lite design system.

What the screen must do:
[paste each spec rule from the task's Reads, with its numbered examples]

How it is laid out:
[paste the tech-design §6 paragraph for this screen]

Show each of these as its own frame, using realistic Tracklite data:
- default, with typical content
- empty (nothing to show yet)
- loading
- a server error, shown as the message the API returns
- validation errors on every field that can fail
- what a member who isn't an admin sees, if it differs
- [any other state the spec examples name]

Constraints: desktop width, keyboard-first, copy follows the Track Lite voice rules. Use existing components only. If one is missing, list it at the end instead of drawing a one-off.
```

**Prompt 2: hand off (in Claude Code).** Paste the design's link and the task ID.

```text
Add this Claude Design link to the Reads line of task [M2.5] in docs/build-plan.md: [claude.ai/design/p/…] ([screen name]). Then do task [M2.5] from docs/build-plan.md.

Read the design with the DesignSync tool. Build the page from Track Lite components and tokens, matching the design's layout, copy and states. Use the design's states for the component tests, alongside the Done examples. If the design needs a component Track Lite lacks, or disagrees with the spec, stop and tell me before writing the page.
```

---

## Done and removed

M0–M9, M12, M13, M14, M11.1 and M11.2a are done. Their entries were removed from this file once the spec and design held what they built; `git log -- docs/build-plan.md` has them. A **Needs** that names a task missing from this file counts as ticked. M10 (operations) was dropped: deployment is maintained outside this repository.

## M11 Launch check

**Run order:** M11.2b, with **M11.3 ∥ M11.4 ∥ M11.5** at any time. M11.3–M11.5 are hand checks, not agent tasks.

- [ ] **M11.2b Performance: board virtualization.** Each board column renders only the cards in view (react-aria `Virtualizer` with `ListLayout`), so a move re-renders a few cards instead of every card on the board. The column's list becomes its scroll container; the scrolling styles go in `styles/components.css`. A trial cut a move to 32–48 ms.

  Why: M11.2a (2026-10-08) measured NFR-002…005 on the NFR-001 seed data (`npm run db:seed:load`), with a production build (`next start`) on localhost driven by headless Chrome emulating 30 ms latency and 50 Mbps. NFR-002, NFR-003 and NFR-004 passed. NFR-005 failed: 290–480 ms from click to next paint with the save held back, because one move re-renders all ~690 board cards (about 460 ms of React work); memoizing columns and cards only got to about 290 ms.
  - Reads: spec NFR-005, REQ-026 · `src/client/screens/Board.tsx`
  - Needs: none
  - Done: `NFR-005: a 300-card column renders only the cards in view` (with element sizes mocked, far fewer than 300 cards are in the page); `NFR-005: moving a card in a 300-card column shows it in its new place before the save finishes`; the existing REQ-026 and NFR-005 Board tests pass unchanged; re-measured as above, a move shows within 100 ms
- [ ] **M11.3 Manual checks.** REQ-015.2, REQ-024.3, REQ-030.3, REQ-031.5, REQ-035.4, REQ-036.4, REQ-041.6, REQ-042.3, SEC-010.2.
- [ ] **M11.4 Browsers and accessibility.** Browsers (NFR-006); keyboard pass and axe contrast scan (NFR-007).
- [ ] **M11.5 Production checks.** SEC-005.1, SEC-007.2 and the `Verify: ops` examples of OPS-001 run against production; confirm the team's headcount against spec §3's assumptions, and check NFR-008 in Resend's delivery logs and the first month's bills against NFR-009.

**Done when:** every box above is ticked. That's R1.


## M15 Bounded contexts

Restructure `src/server/` from one flat folder into bounded contexts (modular DDD). Each context is a folder with a public `index.ts`, and other contexts import it only through that file. Domain functions keep their current style: `actor` first, their own transaction, Drizzle inside. The client is out of scope. Every task moves code without changing behaviour, so the existing tests are the guard. Moves use `git mv` and keep each test next to its source.

| Context | Files from `src/server/` |
|---|---|
| `identity` | sessions, members, sign-in, profile, setup, invitations, password-resets |
| `notifications` | notifications, notification-queue, notification-stats, notification-channels/, worker, email-webhook, descriptions |
| `projects` | projects, labels |
| `issues` | issues |
| `comments` | comments |
| `shared/` (infrastructure) | db, schema, config, log, api-error, api-route, email/, tokens, passwords, limits, cleanup, seed, seed-load |

Allowed dependencies: `comments` → `issues`, `projects`; `issues` → `projects`; every context → `identity`, `notifications`, `shared/`. No cycles.

**Run order:** M15.1 → M15.2 → M15.3 → M15.4 → M15.5 → M15.6 → M15.7 → M15.8. Each task rewrites imports across `src/server/`, `src/app/api/` and `scripts/`, so none run at the same time.

- [x] **M15.1 Context map in the design.** Add a "Bounded contexts" section to `docs/tech-design.md` with the table and dependency rules above. Rewrite the paths named in §1.2, §4.10, D-42 (schemas move to `src/server/<context>/schemas.ts`) and D-44. Update the Architecture section of `CLAUDE.md`. No code changes.
  - Reads: design §1.2, §3.5, §4.10, D-42, D-44, D-45
  - Needs: none
  - Done: `grep -n "src/server/[a-z-]*\.ts" docs/tech-design.md CLAUDE.md` only shows paths inside a context or `shared/`
- [x] **M15.2 shared/.** Move the infrastructure files to `src/server/shared/`. Add `shared/transaction.ts` with one `Transaction` and one `Executor` type, and delete the copies in the other files. Update `drizzle.config.ts`, `package.json` scripts, `scripts/*` and `vitest.config.ts`.
  - Reads: `src/server/db.ts`, `drizzle.config.ts`, `vitest.config.ts`, `scripts/`
  - Needs: M15.1
  - Done: `npm run db:generate` reports no changes; `npm run db:seed` and `npm run worker` still start; the existing tests pass
- [x] **M15.3 identity.** Move the identity files and the `account`, `invitation`, `member`, `password` and `profile` schemas into `src/server/identity/`. Add `index.ts`. Routes and other files import only from it.
  - Reads: design §4.10 · `src/server/sessions.ts`, `src/server/members.ts`
  - Needs: M15.2
  - Done: no file outside `identity/` imports a file inside it other than `index.ts`; the existing tests pass
- [x] **M15.4 notifications.** Move the notification files and `descriptions.ts` into `src/server/notifications/`, along with the `description` schema. Add `index.ts`. Update `scripts/worker.ts` and the `/health/worker` and `/webhooks/email` routes.
  - Reads: design §1.4, §2.6, D-45
  - Needs: M15.3
  - Done: the same import check for `notifications/`; `npm run worker` still starts; the existing tests pass
- [x] **M15.5 projects.** Move `projects.ts` and `labels.ts` with their schemas into `src/server/projects/`. Add `index.ts`, which exports `writableProject` for `issues` and `comments`.
  - Reads: `src/server/projects.ts`, `src/server/labels.ts`
  - Needs: M15.4
  - Done: the same import check for `projects/`; the existing tests pass
- [x] **M15.6 issues.** Move `issues.ts` and its schema into `src/server/issues/`, splitting it into `create.ts`, `update.ts`, `board.ts`, `list.ts` and `rows.ts` (lookups and mappers). `index.ts` exports the domain functions and, under public names, the lookups `comments` needs (`byIssueId`, `issueGone`). Merge the duplicate UUID check with the one in `identity/invitations.ts` into `shared/`.
  - Reads: `src/server/issues.ts`, `src/server/comments.ts`
  - Needs: M15.5
  - Done: the same import check for `issues/`; no file in `issues/` is over 300 lines; the existing tests pass
- [x] **M15.7 comments.** Move `comments.ts` and its schema into `src/server/comments/`, and add `index.ts`. It imports `issues` and `projects` only through their `index.ts` files.
  - Reads: `src/server/comments.ts`
  - Needs: M15.6
  - Done: the same import check for `comments/`; the existing tests pass
- [ ] **M15.8 Architecture test.** Add `src/server/architecture.test.ts`. It reads every import under `src/server/`, `src/app/` and `scripts/` and fails when a file imports another context's file other than its `index.ts`, or when a dependency breaks the allowed directions. Delete the now-empty `src/schemas/`.
  - Reads: this milestone's table · `src/repository.test.ts`
  - Needs: M15.7
  - Done: `M15: a context imports another only through its index.ts`; `M15: context dependencies follow the context map`; both fail on a deliberately added deep import (check once by hand, then undo)

**Done when:** `src/server/` holds only the five context folders, `shared/` and `architecture.test.ts`. In `npm run dev` a member signs in, creates an issue, moves it on the board and comments with an @mention, and `npm run worker` delivers the mention to Mailpit.
