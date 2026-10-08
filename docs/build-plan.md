# Tracklite: Build plan

Milestones in build order for R1, each split into tasks small enough for one prompt. Behaviour comes from `docs/tracklite-spec.md` (v0.10); the technical design is in `docs/tech-design.md`, referred to below by section number (§).

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
- The page task writes the RTK Query endpoints it uses, with request and response types taken from §3.3, in the client code. It tests against mocked responses of those types.
- The API task doesn't touch those files. Its tests check the response shape against §3.3.
- **Wire-up:** whichever of the pair merges second runs the page against the real API, fixes any mismatch, and makes each handler's return value `satisfies` the page's response type, so `npm run typecheck` keeps them in step from then on. If §3.3 is too vague to type a response, the page task fixes §3.3 first.

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
- Clay accent for interactive and primary. Terracotta only for exceptions: urgent, overdue, destructive. Never both accents in one small component.
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
- Every signed-in screen uses the same shell. The sidebar, top to bottom: My issues; Projects (active projects as "Name · KEY", with a + for admins that opens New project); Archived projects; Members (admins only); and at the bottom the member's initials and name, opening a menu with Profile and Sign out.
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

## M0 Foundation

**Run order:** M0.1 → M0.2 → **M0.3 ∥ M0.4** → **M0.5 ∥ M0.6**. M0.3 needs only M0.2, so it can also run alongside M0.5 and M0.6.

- [x] **M0.1 Schema and first migration.** Drizzle schema for every table and enum, and the first migration.
  - Reads: design §2 · spec §8
  - Needs: none
  - Done: the migration applies to an empty database; typecheck passes
- [x] **M0.2 Config and test harness.** Environment config checked at startup; a separate test database, migrate-before-tests, data factories, a helper that moves timestamps into the past; the `test`, `lint` and `typecheck` scripts.
  - Reads: design §1.1, §1.3, §1.6 · spec §12
  - Needs: M0.1
  - Done: a sample test creates a member with a factory and moves its `created_at` back a day; the app refuses to start with a variable missing
- [x] **M0.3 API wrapper and health.** `apiRoute` (same-site check for writes, `ApiError` → error body, anything else → `500`, one log line per request with no bodies or tokens); the catch-all for unknown `/api` paths (`401` while no sessions exist yet; the signed-in `404` comes in M1.2); `GET /health`.
  - Reads: design §1.2, §3.1, §3.2, §4.4, §4.8 · spec API-001, STD-1…4, STD-7, SEC-004.1, SEC-006, SEC-007, OPS-005
  - Needs: M0.2
  - Done: SEC-004.1, SEC-007.*, OPS-005 (`/health`) pass; tests for the error mapping and the `500` path
- [x] **M0.4 Browser entry and router.** The catch-all page and `ClientApp` (browser only), React Router with lazily loaded routes, the Not found page, the app shell with an empty sidebar.
  - Reads: design §1.7, §6.1, §6.2 · spec API-004 · AGENTS.md (read the Next.js guide it names)
  - Needs: M0.2
  - Done: any page address loads the shell; an unknown address shows Not found; moving between two routes doesn't reload the document
- [x] **M0.5 Store and data layer.** The Redux store, the RTK Query `api` slice and its `baseQuery` (redirect to sign-in on `401`), the `toast` slice, the 300 ms loading hook.
  - Reads: design §1.7 · spec STD-1, STD-9
  - Needs: M0.4
  - Done: STD-9.*; tests for the `401` redirect and the loading hook; with no session the shell lands on sign-in
- [x] **M0.6 Content Security Policy.** `src/proxy.ts` setting the nonce-based CSP, and the nonce passed to Next.js's inline scripts.
  - Reads: design §4.9, D-26 in §7 · spec SEC-010 · the Next.js proxy and CSP guides in `node_modules/next/dist/docs/`
  - Needs: M0.4
  - Done: SEC-010.*; the shell loads with no CSP errors in the console

**Done when:** `/health` returns `200`; `GET /api/anything` returns `401`; any page address loads the shell and shows sign-in.

## M1 Sign-in and account

**Run order:** API: **M1.1 ∥ M1.4** → M1.2 → M1.3 → **M1.5 ∥ M1.6**. Pages: **M1.7 ∥ M1.8**, alongside any of the API tasks. M1.4 needs only M0.2, so it can also run alongside M1.2 and M1.3. Shared file: M1.5 and M1.6 both add to the SEC-001 limits module from M1.3.

- [x] **M1.1 Passwords and tokens.** Argon2id hashing, the password rules, token creation and hashing.
  - Reads: design §4.1, §4.2 · spec REQ-048, SEC-003, SEC-008
  - Needs: M0.2
  - Done: REQ-048.*, SEC-003.*, SEC-008.1 (SEC-008.2 needs a member response, so it moved to M1.3)
- [x] **M1.2 Sessions.** Creating, looking up and ending sessions; the cookie; the 30-day sliding expiry; `last_active_at` rewritten at most hourly; `requireMember` and `requireAdmin`; the signed-in `404` for unknown `/api` paths.
  - Reads: design §2.2, §4.3 · spec REQ-006, SEC-004, SEC-006
  - Needs: M0.3, M1.1
  - Done: REQ-006.*, SEC-004.*, SEC-006.*
- [x] **M1.3 Sign-in and sign-out API.** `POST /api/sessions`, `DELETE /api/sessions/current`, `GET /api/me`, and the SEC-001 sign-in limit.
  - Reads: design §3.3 (sign-in table), §3.4 (last bullet), §4.5 · spec REQ-047, REQ-003.3–4, SEC-001, SEC-008.2
  - Needs: M1.2
  - Done: REQ-047.*, REQ-003.3–4, SEC-001's sign-in examples, SEC-008.2 (against `GET /api/me`)
- [x] **M1.4 Sending email.** `sendEmail()` with Mailpit, in-memory and Resend implementations; the reset email template.
  - Reads: design §1.5, §5.1, §5.2, §5.3, §5.6 · spec API-002, §9 "Email content", STD-6
  - Needs: M0.2
  - Done: the reset email in the in-memory outbox matches spec §9 word for word; a dev script delivers one to Mailpit
- [x] **M1.5 Password reset API.** `POST /api/password-reset-links`, `/password-reset-lookups` and `/password-resets`, with the reset-request limit.
  - Reads: design §3.3, §4.5, §4.6 · spec REQ-050, SEC-001, STD-6
  - Needs: M1.3, M1.4
  - Done: REQ-050.*, SEC-001's reset examples, STD-6's reset example
- [x] **M1.6 Profile API and setup command.** `PATCH /api/me`, `PUT /api/me/password` (a wrong current password counts toward the sign-in limit), and the first-admin setup command.
  - Reads: design §3.3, §4.5 · spec REQ-003, REQ-049, OPS-001
  - Needs: M1.3
  - Done: REQ-003.1, REQ-003.3, REQ-003.4, REQ-049.*; OPS-001.1–2 (both `Verify: ops`) against the command's `createFirstAdmin()`. REQ-003.2 moved to M2.2, since setup only runs with no members, so a username can't be taken yet
- [x] **M1.7 Sign-in pages.** Sign in, forgot password and reset password pages; sign out; return after sign-in limited to this app's pages.
  - Reads: design §1.7, §6.1, §6.3 · spec REQ-047, REQ-050, SEC-009 · design claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Signed-out+screens.dc.html (Signed-out screens)
  - Needs: M0.5 · API description: M1.3, M1.5
  - Done: SEC-009.*; component tests for each page's error and expired states
- [x] **M1.8 Profile page.** Full name, the read-only fields and the Change password form with its success message.
  - Reads: design §6.3 (Profile) · spec REQ-003, REQ-049 · design claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Profile.dc.html (Profile)
  - Needs: M0.5 · API description: M1.6
  - Done: component tests for save, change password and the REQ-049 message

**Done when:** the first admin can be created, sign in, reset their password through Mailpit, and change it from the profile.

## M2 Members and invitations

**Run order:** API: **M2.1 ∥ M2.3** → M2.2. Pages: **M2.4 ∥ M2.5**, alongside any of the API tasks.

- [x] **M2.1 Invitation API.** Create (a resend if one is open), resend, revoke, list, look up; the invitation email template; a failed send saves nothing.
  - Reads: design §2.2, §3.3, §4.6, §5.3 · spec REQ-001, REQ-051, §9 "Email content"
  - Needs: M1.4, M1.2
  - Done: REQ-001.*
- [x] **M2.2 Accept invitation API.** `POST /api/members`: creates the member and signs them in.
  - Reads: design §3.3, §4.6 · spec REQ-002, REQ-003, STD-2
  - Needs: M2.1
  - Done: REQ-002.*, REQ-003.2, STD-2.*
- [x] **M2.3 Member admin API.** `GET /api/members` (emails only for admins), `PATCH /api/members/{username}` for role, deactivate and reactivate, and the last-admin guard with its row lock.
  - Reads: design §2.2, §3.3 · spec REQ-007, REQ-008, REQ-052
  - Needs: M1.2
  - Done: REQ-007.*, REQ-008.*, REQ-052.*, including two admins demoting each other at once. Issues and pickers don't exist yet, so REQ-007.2 and REQ-008.2 are checked through the `deactivated` flag in `GET /api/members`, REQ-007.4 through a `PATCH /api/me` save, and REQ-052.2 through an admin-only save; the issue parts move to M4.2 (assignee) and M4.3 (description save)
- [x] **M2.4 Accept-invitation page.**
  - Reads: design §3.4 (invitation bullet), §6.3 (Accept invitation) · spec REQ-002 · design claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Accept+invitation.dc.html (Accept invitation)
  - Needs: M1.7 · API description: M2.2
  - Done: component tests for the form, expired and no-longer-valid states
- [x] **M2.5 Members page.** Invite form, invitations table with Resend and Revoke, members table with the **⋯** menu and the deactivate confirmation.
  - Reads: design §6.3 (Members) · spec REQ-051, REQ-007, REQ-001 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Members.dc.html (Members)
  - Needs: M1.7 · API description: M2.1, M2.3
  - Done: REQ-051.*; component tests for the confirmations

**Done when:** the admin invites a second person, who joins through the Mailpit link; the admin can then deactivate and reactivate them.

## M3 Projects and labels

**Run order:** API: **M3.1 ∥ M3.2** → **M3.3 ∥ M3.4**. Pages: M3.5 → **M3.6 ∥ M3.7**, alongside the API tasks (M3.6 also waits for M3.1). M3.1 needs only M0.2, so it can start during M1.

- [x] **M3.1 Markdown module.** Rendering, HTML shown as text, the link filter, mention parsing, text extraction.
  - Reads: design §4.7 · spec SEC-002, DATA-001
  - Needs: M0.2
  - Done: SEC-002.*, DATA-001's parsing examples
- [x] **M3.2 Projects API.** List, create, get, rename, archive, unarchive, delete with its cascade; the reserved-key table; the "This project is archived" check reused by later writes.
  - Reads: design §2.3, §2.7, §3.3 (projects table) · spec REQ-009, REQ-010, REQ-011, REQ-013, REQ-014, DATA-002, DEC-001
  - Needs: M1.2
  - Done: REQ-009.*, REQ-010.*, REQ-011.*, REQ-013.1 and REQ-013.3 (project lists), REQ-013.4 (the shared check), REQ-014.1, REQ-014.3, REQ-014.4, DATA-002's project examples
- [x] **M3.3 Project description API.** Saves with a version check (`409` on conflict); mentions written as `mentions` rows.
  - Reads: design §2.5, §3.2 (409), §3.3 · spec REQ-012, REQ-046.2, STD-8, DATA-001
  - Needs: M3.1, M3.2
  - Done: REQ-012.*, REQ-046.2, STD-8.*
- [x] **M3.4 Labels API.** List, create, rename, recolour, delete, with the 8 colours.
  - Reads: design §2.3, §3.3, §6.6 · spec REQ-021
  - Needs: M3.2
  - Done: REQ-021.*, REQ-013.5, REQ-013.6 (from M3.2)
- [x] **M3.5 Project navigation pages.** Sidebar, New project dialog, project header, project settings, archived list; the Projects API refuses renaming an archived project.
  - Reads: design §6.2, §6.3 (Project settings, Archived projects) · spec REQ-009, REQ-011, REQ-013, REQ-014, REQ-015 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Project+navigation.dc.html (Project navigation)
  - Needs: M0.5 · API description: M3.2
  - Done: component tests for the typed-key delete and the empty archived list; REQ-013.7
- [x] **M3.6 Project details page.** Formatted description with Edit, Save and Cancel, the `409` message, and the unsaved-description prompt.
  - Reads: design §6.4 (description and unsaved-text bullets) · spec REQ-012, REQ-035, REQ-046, STD-8 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Project+details.dc.html&via=share (Project details)
  - Needs: M3.5, M3.1 · API description: M3.3
  - Done: component tests for save, conflict and the leave prompt
- [x] **M3.7 Labels page.** List, create, rename, recolour, delete with the issue-count confirmation.
  - Reads: design §6.6 · spec REQ-021 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Labels.dc.html (Labels)
  - Needs: M3.5 · API description: M3.4
  - Done: component tests for create and delete confirmation

**Done when:** an admin can create, rename, archive, unarchive and delete a project; any member can edit its description and manage its labels.

## M4 Issues

**Run order:** API: M4.1 → M4.2 → M4.3. Pages: M4.4 → M4.5, alongside the API tasks.

- [x] **M4.1 Issue create API.** Numbering by project row lock, and `requestId`.
  - Reads: design §2.4, §3.3 · spec REQ-016, STD-5
  - Needs: M3.2
  - Done: REQ-016.* (including .4, concurrent creates), STD-5.*
- [x] **M4.2 Issue read and update API.** `GET` and `PATCH /api/issues/{ID}`, one field per save; a status change puts the issue at the top of its new column; assignee and 10-label rules.
  - Reads: design §2.4, §3.3, §3.4 · spec REQ-017, REQ-018, REQ-019, REQ-020, REQ-027.4
  - Needs: M4.1, M3.4
  - Done: REQ-017.*…REQ-020.*, REQ-027.4; the issue parts of REQ-007.2 and REQ-008.2 (from M2.3); REQ-013.1's read-only issue and REQ-013.4 against an issue save (from M3.2)
- [x] **M4.3 Issue description and delete API.** Description saves with a version check and mention rows; delete by creator or admin.
  - Reads: design §2.5, §2.7 · spec REQ-022, REQ-023, DATA-001, DATA-002
  - Needs: M4.2, M3.1
  - Done: REQ-022.*, REQ-023.*, DATA-002's issue examples; REQ-007.4 against a description save (from M2.3)
- [x] **M4.4 Issue page.** Header with in-place title, side panel pickers (status, priority, assignee), delete, New issue dialog, canonical addresses.
  - Reads: design §6.1, §6.3 (New issue), §6.4 · spec REQ-016…019, REQ-023 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Issue+page.dc.html&via=share (Issue page)
  - Needs: M3.5, M3.1 · API description: M4.1, M4.2, M4.3
  - Done: component tests for title edit, each picker and delete
- [x] **M4.5 Label picker and description editor.** The label picker that creates new labels; the description editor with the `@` suggestion list (built to be reused by comments).
  - Reads: design §6.4 (mention suggestions), §6.6 · spec REQ-020, REQ-022, DATA-001 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Issue+page.dc.html&via=share (Issue page) · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Issue+page+-+labels+and+description.dc.html&via=share (Label picker and description editor)
  - Needs: M4.4 · API description: M4.2, M4.3
  - Done: component tests for creating a label from the picker, the 10-label limit, and inserting `@username`

**Done when:** a member can create, edit and delete issues from the issue page, and two members creating at once get different numbers.

## M5 Board

**Run order:** API: M5.2 → M5.3. Pages: M5.4 → M5.5, alongside the API tasks (M5.5 also waits for M5.1). M5.1 needs only M0.4, so the spike can run as early as M1, which settles the drag-and-drop risk before any board code exists.

- [x] **M5.1 Drag-and-drop spike.** A throwaway page: React Aria `GridList` drag and drop across 5 columns, including automatic scrolling near a column's edges. Record the result as a decision in design §7; if it falls short, record the fallback.
  - Reads: design §6.5 · spec REQ-024, REQ-026 · React Aria docs for `GridList` and `useDragAndDrop`
  - Needs: M0.4
  - Done: a decision in §7; the spike code is deleted
- [x] **M5.2 Board API.** `GET /api/projects/{KEY}/board`, with the 14-day window for Done and Canceled.
  - Reads: design §2.4, §3.3 · spec REQ-024, REQ-025, REQ-028
  - Needs: M4.2
  - Done: REQ-024.*, REQ-025.*, REQ-028.* (API side)
- [x] **M5.3 Position API.** `PUT /api/issues/{ID}/position` with fractional keys; `updated_at` unchanged for moves within a column.
  - Reads: design §2.4, §3.4 (first bullet) · spec REQ-026, REQ-027, REQ-036.5
  - Needs: M5.2
  - Done: REQ-026.*, REQ-027.*, REQ-036.5
- [x] **M5.4 Board page.** Columns that scroll on their own, cards, the **⋯** menu (move by menu), the column **+** buttons.
  - Reads: design §6.5 · spec REQ-024, REQ-025, REQ-029, REQ-030 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Board.dc.html&via=share (Board)
  - Needs: M4.4 · API description: M5.2, M5.3
  - Done: REQ-029.*, REQ-030.* (auto); component tests for the card layout
- [x] **M5.5 Drag and drop.** Mouse and keyboard moves using the spike's result; optimistic moves with rollback and a toast.
  - Reads: design §1.7 (optimistic moves), §6.5, the M5.1 decision · spec REQ-026, NFR-005
  - Needs: M5.1, M5.4
  - Done: tests for the optimistic update and rollback

**Done when:** cards can be moved by mouse and by keyboard; a failed save puts the card back; the order survives a reload for every member.

## M6 List view

**Run order:** **M6.1 ∥ M6.2**. M6.1 needs only M4.2, so it can run alongside M4.3–M4.5 and M5.

- [x] **M6.1 List API.** `pg_trgm` indexes; the search query (every typed word must match, `%` and `_` treated as plain characters); filters, sort, `offset` paging; unknown values ignored.
  - Reads: design §2.4, §3.3, §3.4 (paging) · spec REQ-036…039, NFR-004
  - Needs: M4.2
  - Done: REQ-036.*…REQ-039.*
- [x] **M6.2 List page.** Filters and sort kept in the URL, search after a 300 ms pause, more rows loaded on scroll.
  - Reads: design §1.7 · spec REQ-037…040 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=List.dc.html&via=share (List)
  - Needs: M4.4 · API description: M6.1
  - Done: REQ-040.*; component tests for URL round-trip and the search pause

**Done when:** every REQ-036…040 example passes, and a copied link reopens the same view.

## M7 Comments

**Run order:** **M7.1 ∥ M7.2** → M7.3.

- [x] **M7.1 Comments API.** List, post (with `requestId`), edit (with a version check), delete, for issues and projects; mentions written as `mentions` rows.
  - Reads: design §2.5, §3.3 (comments table) · spec REQ-031…034, REQ-046.1, DATA-001
  - Needs: M4.3, M3.3
  - Done: REQ-031.*…REQ-034.*, REQ-046.1
- [x] **M7.2 Comment thread.** Thread and comment box on the issue page and project details page; edit, delete, "(edited)", highlighted mentions; reuses the M4.5 suggestion list.
  - Reads: design §6.4 · spec REQ-031…034, DATA-001 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=Comments.dc.html&via=share (Comments)
  - Needs: M4.5, M3.6 · API description: M7.1
  - Done: component tests for post, edit and delete
- [x] **M7.3 Comment extras.** The unsent-comment guard (`useBlocker` and `beforeunload`); time formatting; scrolling to `#comment-{id}`.
  - Reads: design §6.4 (unsaved text), §6.7 · spec REQ-035, DATA-003
  - Needs: M7.2
  - Done: REQ-035.*, DATA-003.*; tests for the time formats

**Done when:** members can post, edit and delete comments on issues and projects, and mentions are highlighted.

## M8 My issues

**Run order:** **M8.1 ∥ M8.2**. M8.1 needs only M4.2, so it can run alongside M5–M7.

- [x] **M8.1 My issues API.** `GET /api/my-issues`: grouped by status, sorted, with the 14-day window.
  - Reads: design §3.3 · spec REQ-041
  - Needs: M4.2
  - Done: REQ-041.* (API side), REQ-013.2 and REQ-013.3's My issues part (from M3.2)
- [x] **M8.2 My issues page.** The page, and sign-in landing there.
  - Reads: design §6.1 · spec REQ-041, REQ-042 · design https://claude.ai/design/p/6e969269-fc54-45da-a7fc-f0f764dbc20a?file=My+issues.dc.html&via=share (My issues)
  - Needs: M1.7 · API description: M8.1
  - Done: REQ-042.* (auto); component tests for the groups

**Done when:** sign-in lands on a correct My issues page.

## M9 Notifications

**Run order:** M9.1 → M9.2 → **M9.3 ∥ M9.4 ∥ M9.5**. Shared file: M9.3 and M9.5 both hook into the worker loop from M9.2.

- [x] **M9.1 Creating notifications.** In the same transaction as assignments and new mentions, joining an existing email or creating one.
  - Reads: design §2.6 · spec REQ-043, REQ-044, REQ-045, §8 Notification
  - Needs: M4.3, M7.1
  - Done: REQ-043.*, REQ-044.*, REQ-045's grouping examples
- [x] **M9.2 Worker.** The polling loop with `SKIP LOCKED`, the drop checks, retries, a clean stop on `SIGTERM`.
  - Reads: design §1.4, §5.2 · spec REQ-045, STD-6
  - Needs: M9.1, M1.4
  - Done: REQ-045's timing and retry examples, STD-6's notification examples
- [x] **M9.3 Notification templates.** Single and combined emails; excerpts.
  - Reads: design §5.3 · spec §9 "Email content"
  - Needs: M9.2
  - Done: the remaining REQ-045.*; templates match spec §9 word for word
- [x] **M9.4 Bounce webhook.** `POST /webhooks/email` with the signature check, marking notifications and invitations as bounced.
  - Reads: design §5.4 · spec API-003, REQ-051
  - Needs: M9.2, M2.1
  - Done: API-003.*; a bounced invitation shows as Bounced in the list API
- [ ] **M9.5 Cleanup job.**
  - Reads: design §1.4, §2.7 · spec DATA-004
  - Needs: M9.2
  - Done: DATA-004.*

**Done when:** every REQ-043…045 example passes against the in-memory outbox, and a real assignment shows up in Mailpit about 2 minutes later.

## M10 Operations

**Run order:** M10.1 → **M10.2 ∥ M10.3 ∥ M10.4**. All three change the same VPS, so make each one's changes in its own script or config file.

- [x] **M10.1 Server.** PostgreSQL; Caddy with TLS, HSTS, security headers, `X-Forwarded-For` and an access log without `token`; systemd units for web and worker; journald keeping 14 days; `/etc/tracklite/env` with secrets.
  - Reads: design §1.1, §4.9 · spec SEC-005, OPS-006
  - Needs: M9.2
  - Done: the app serves over HTTPS; SEC-005.1 checked by hand
- [ ] **M10.2 Deploy and rollback.** One deploy command (migrate, then switch, keeping the previous release) and one rollback command.
  - Reads: design §1.1 · spec OPS-002, OPS-004
  - Needs: M10.1
  - Done: a deploy from `main` and a rollback both work
- [ ] **M10.3 Backups.** Daily at 03:00 UTC to storage off the VPS, keeping 14 copies.
  - Reads: spec OPS-003
  - Needs: M10.1
  - Done: a backup has been restored into a scratch database
- [ ] **M10.4 Monitoring and email domain.** External uptime check on `/health`; Resend domain set-up (SPF, DKIM, DMARC, the webhook).
  - Reads: design §5.5 · spec OPS-005
  - Needs: M10.1, M9.4
  - Done: the uptime check alerts when the web service is stopped; a test email passes SPF and DKIM

**Done when:** a deploy from `main` and a rollback both work, and a backup has been restored into a scratch database.

## M11 Launch check

**Run order:** **M11.1 ∥ M11.3 ∥ M11.4 ∥ M11.5** → M11.2. M11.3–M11.5 are hand checks, not agent tasks.

- [ ] **M11.1 Seed data.** A script for the NFR-001 test data (50 projects, 10,000 issues, 50,000 comments).
  - Reads: spec NFR-001
  - Needs: M9
- [ ] **M11.2 Performance.** Measure NFR-002…005 on the seed data, and fix anything over its target (one task per fix if needed).
  - Reads: spec NFR-002…005
  - Needs: M11.1
- [ ] **M11.3 Manual checks.** REQ-015.2, REQ-024.3, REQ-030.3, REQ-031.5, REQ-036.4, REQ-041.6, REQ-042.3.
- [ ] **M11.4 Browsers and accessibility.** Browsers (NFR-006); keyboard pass and axe contrast scan (NFR-007).
- [ ] **M11.5 Production checks.** SEC-005.1 and the OPS-001…005 examples run on the production VPS; confirm the team's headcount against spec §3's assumptions, and check NFR-008 in Resend's delivery logs and the first month's bills against NFR-009.

**Done when:** every box above is ticked. That's R1.
