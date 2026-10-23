# Design refresh: implementation plan

The Claude Design export "Tracklite project setup" (imported 2026-10-22) is a full redesign of every R1 screen. This plan compares it with the code on `main` at `4e3c85c` and splits the work into tasks in the build-plan format. Nothing here is built yet; the Step 0 decisions are made.

## What was imported

| Path | What it is |
|---|---|
| `Tracklite prototype.dc.html` | The clickable prototype. `<sc-if value="{{ pg.* }}">` blocks are screens; the script at the bottom holds data, copy and handlers. |
| `Tracklite states.dc.html` | States you can't reach by clicking: loading, load failure, server errors, conflicts. Lines ~300–313 list what the design found missing from the kit. |
| `Page - *.dc.html` | One frame per screen, each embedding the prototype at a start screen. `Page - My issues - member.dc.html` has the 1024 px notes. |
| `Tracklite logo.dc.html` | Logo options. The chosen one is 1e, the "lifted card". |
| `BRIEF.md` | The project brief given to Claude Design (it was `CLAUDE.md` in the export; renamed so Claude Code doesn't load it as instructions). |
| `_ds/` | The Track Lite kit snapshot the design used. Its tokens match `src/components/ui/track-lite/styles/` (only font loading differs). Its `components.css` is an older, shorter copy of ours. Use ours. |
| `archive/`, `screenshots/`, `uploads/` | Earlier iterations and audit screenshots. Reference only. |

To view: `python3 -m http.server 8765 --directory docs/design`, then open `http://127.0.0.1:8765/Tracklite%20prototype.dc.html`. The files load fonts and icons from CDNs. That's fine for viewing, but the app itself must never do it (CSP).

## Step 0: decide the spec conflicts (owner)

The spec wins over the design (ground rules). These parts of the design contradict the spec. The owner decided them on 2026-10-22. **Spec** means keep the spec and ignore that part of the design; **Design** means change the spec first (M17.0), with a changelog line, then build it.

| # | Design | Spec | Decision |
|---|---|---|---|
| C1 | The List view becomes a My-issues-style grouped list: no filters, search, sort or paging; Done and Canceled cut to 14 days. | REQ-036–040, REQ-028 | **Spec.** Restyle the rows only. |
| C2 | Project details has no comments. It gains per-status counts and "Created … by …". | REQ-046, REQ-032.2 | **Spec** for comments. Add the counts and created line if the API has them (it needs an endpoint change; see M17.11). |
| C3 | Labels move inside the admin-only Project settings. The header's "Labels" link is gone. | REQ-021, REQ-013.5/.6 | **Spec.** Keep the members' Labels page; give it the design's ⋯-menu row style. |
| C4 | Delete project is a plain confirm, with no "type the key" step. | REQ-014 | **Spec** |
| C5 | Board drops land only at the top of a column. | REQ-027.1/.2 | **Spec** |
| C6 | My issues has no Project column. | REQ-042 | **Spec** |
| C7 | Comment edit, delete, "(edited)" and the highlighted comment are missing. | REQ-033, REQ-034 | **Spec.** This is an omission in the design; keep today's behaviour, restyled. |
| C8 | The comment button says "Comment"; the comment time has no "·". | REQ-031.1/.2 | **Spec.** Keep "Post" and "Sam Lee · just now": a wording change isn't worth the spec and test churn. |
| C9 | The delete-issue dialog says "its 3 comments". | REQ-023 | **Spec.** Keep "and its comments": a count adds singular, plural and zero cases for little gain. |
| C10 | Description checklists can be ticked. | DEC-001 | **Spec** |
| C11 | Failed saves show the toast **and** a note beside the control until the next edit (everywhere). | STD-9 (toast only) | **Spec.** The toast already says it; a second copy beside the control is a cross-cutting change for little gain. |
| C12 | Success toasts: "WEB-42 moved to Done", "Invitation sent to …", "Deleted WEB-42", "Created Website · WEB", and others. | Not covered | **Spec.** Keep today's feedback (inline notes such as "Invitation sent to …" and navigation after creates). No success toasts. |
| C13 | After a password reset the member goes to Sign in; the forgot-password email failure is inline; the sign-in network toast says "Couldn't sign in". | REQ-050.3, STD-6/9 | **Spec** |
| C14 | Members copy: "Alex Kim is already a member", the deactivate wording, the invitation "Sent" column, no menu on your own row, a role item for deactivated members. | REQ-001, REQ-007, REQ-051 | **Spec** for copy and actions; take the layout. |
| C15 | Rename and project name limit of 60. | REQ-009 (50) | **Spec.** Server copy is unchanged. |
| C16 | The notification-status warning shows after 5 min. | OPS-005 (2 min), REQ-053 (no warning) | **Design, with 2 min.** Add both warnings to REQ-053, using OPS-005's 2 min threshold rather than the design's 5. |
| C17 | The empty My issues copy is "Nothing assigned to you. Open a project to find or create issues." | REQ-041.4 | **Design.** STD-7 favours naming the next action. |
| C18 | Curly apostrophes in "Couldn’t load this.", "Couldn’t move WEB-42". | Straight in the spec and code | **Design.** Update the spec copy and the tests together. |

The tasks below follow these decisions. Pages never invent styles (design-system rules), so every new visual goes into `src/components/ui/track-lite/` first (M17.1–M17.5), with its own test of the behaviour we add.

## Milestone M17 Design refresh

**Run order:** M17.0 → (M17.1 ∥ M17.2 ∥ M17.3 ∥ M17.4 ∥ M17.5) → (M17.6 ∥ M17.7 ∥ M17.8 ∥ M17.12 ∥ M17.13 ∥ M17.14 ∥ M17.15) → (M17.9 ∥ M17.10 ∥ M17.11 ∥ M17.16). The kit tasks share `styles/components.css` and `index.ts`; merge them in the order listed. M17.9–M17.11 and M17.16 wait for M17.8 because they render the project header.

Every screen task: **Reads** includes `docs/design/Tracklite prototype.dc.html` (the screen's `pg.*` block), the matching frames in `docs/design/Tracklite states.dc.html`, and `docs/design-system.md`. Build from kit components and tokens, never from the design's inline styles. Existing tests keep passing; where copy changes by decision, update the spec, then the test name and assertion.

- [x] **M17.0 Spec updates.** Edit `docs/tracklite-spec.md` for the **Design** rows, with one changelog line each: C16 (REQ-053 warnings "No pass for {N} min. Notifications wait in the queue until the worker runs." and "The worker has never run. No notifications are sent until it does.", after 2 min per OPS-005), C17 (REQ-041.4 empty copy), C18 (curly apostrophes in "Couldn’t …" messages, with the tests that assert them).
  - Needs: none
  - Done: spec version bumped; `npm test` green with the apostrophe change.

- [x] **M17.1 Kit: Logo.** A `Logo` component: the 1e mark SVG copied from `Tracklite logo.dc.html` plus the serif wordmark, in sizes `rail` (22 px mark, 17 px word, 7 px gap) and `signed-out` (26 px, 20 px, 8 px gap). The mark is `aria-hidden`; the wordmark is the accessible name.
  - Done: component test for both sizes rendering the "Tracklite" name once.

- [x] **M17.2 Kit: Toast position.** Centre the toast 30 px from the bottom, with the err stripe and no ×. No success tone and no failure notes (C11, C12).
  - Done: the existing Toaster test extended to check there is no dismiss button.

- [ ] **M17.3 Kit: Controls.** `Button` gets a `busy` label prop; `Picker` and `MultiPicker` get a caret-down and an empty-note slot; `LinkTabs` gets icons and the app-bar selected style (accent-100 / accent-800 / 500); an icon-button `current` state; `Field` help accepts rich content; a rail item that triggers a menu opening upward (`Pop` placement `top`).
  - Done: one component test each for the behaviour we add (busy label swap, caret present, `aria-current` tab styling hook, upward menu placement).

- [ ] **M17.4 Kit: Lists.** A collapsible `ListGroup` (button head, caret, `aria-expanded`, a "Skip to {next}" link visible on focus); a row-link variant of `tl-list-row` with grid columns passed as a prop and an `aria-hidden` eyebrow header row; a section heading with a mono count; `tl-table__num` right-aligned cells; a two-column settings grid; a warning text style (accent-2-700).
  - Done: ListGroup collapse and skip-link tests.

- [ ] **M17.5 Kit: Board and issue styles.** Board: columns `flex: 1 0 248px`, an `h2` column head with a rule once scrolled, the drag handle and ⋯ on the card's top right shown on hover or focus (always on touch), the whole card clickable, greyscale priority on closed cards, the urgent plate and In Progress ring at accent-2-700. Issue: a 42 px title with hover and focus backgrounds, `.tl-issue-section` with the rule on top, an unboxed `.tl-comment` with the time right-aligned, medium avatars.
  - Done: BoardCard test that the handle and menu stay reachable by keyboard; visual check against the design frames.

- [ ] **M17.6 Shell and sidebar.** The logo in the rail head; three groups (My issues · Projects with +, its projects, the empty state and Archived projects · Members); project rows with a square `Glyph` and mono "· KEY"; the Notifications item removed (reached from Members; Members stays current on `/settings/notifications`); Archived projects current while viewing an archived project; the member menu as a full-width rail item with an md avatar, a caret-up and an upward menu; Not found as a serif page heading with "Go to My issues".
  - Reads: + spec REQ-053, STD-4 · `src/client/{Shell,Sidebar}.tsx`, `screens/NotFound.tsx`
  - Needs: M17.1, M17.3
  - Done: existing Sidebar tests updated; a test that Members is current on `/settings/notifications`.

- [ ] **M17.7 Signed-out screens.** The logo in the header; main bottom padding; the Reset password busy label "Saving…"; "signed in as someone else" and load failure as the compact layout (13 px paragraph, secondary Sign out / sm Retry, `role="alert"`); Accept invitation's expired state as a title plus body. Keep the spec's flows (C13).
  - Reads: + spec REQ-047–050, STD-6, STD-9 · `src/client/screens/{SignIn,ForgotPassword,ResetPassword,AcceptInvitation}.tsx`, `SignedOut.tsx`
  - Needs: M17.1, M17.3

- [ ] **M17.8 Project header.** The book icon button left of the name ("Project details", current on the details page); tabs with icons; the order [details][name][Archived][tabs] … [gear][New issue]; an issue-page variant with the breadcrumb "Name · KEY / WEB-42" and no tab selected. Keep a Labels entry if C3 is rejected (in the header or project details; ask the owner where).
  - Reads: + spec REQ-046 · `src/client/ProjectHeader.tsx`
  - Needs: M17.3

- [ ] **M17.9 Board.** Apply the M17.5 card; no + on Done and Canceled; "No issues." in every empty column of an archived project; the ⋯ label "Actions for WEB-42" with ✓ on the current status; 2 labels plus "+N" sorted A–Z with the hidden names as its title; an md avatar with the accent tone for yourself.
  - Reads: + spec REQ-024–028 · `src/client/screens/Board.tsx`
  - Needs: M17.5, M17.8

- [ ] **M17.10 Issue page.** The M17.8 header (also while loading and on load failure); the 42 px title; sections with the rule on top; one column below 860 px of container width with the fields panel between the title and the description; pickers with caret, md avatars and the "No labels in this project yet." empty note; "No description yet. Add one."; the "changed by someone else" state with Reload and Save disabled; the restyled comments (keeping edit, delete and "(edited)" per C7); "Delete issue…" with "Deleting…"; the mono created date.
  - Reads: + spec REQ-018–023, REQ-031–034, STD-8 · `src/client/screens/Issue.tsx`, `CommentThread.tsx`, `DescriptionEditor.tsx`
  - Needs: M17.3, M17.5, M17.8
  - Split if too big: M17.10a layout, title and fields · M17.10b description and comments.

- [ ] **M17.11 Project details.** 640 px column; the description heading as a meta label with a quiet "Edit project description" button; "No description yet. Add one." (no link when archived); per C2, comments stay. If accepted: an Issues section ("N open", one row per status with a count, linking to the list filtered by that status) and "Created {date} by {name}". The per-status counts need a §3.3 endpoint change, so split off M17.11a (API) first.
  - Reads: + spec REQ-046 · `src/client/screens/ProjectDetail.tsx`
  - Needs: M17.8

- [ ] **M17.12 My issues.** A mono total count after the title; collapsible status groups with Done and Canceled collapsed; grid rows (keeping the Project column per C6) with no sideways scroll at 1024 px (labels shrink first, the title keeps 240 px); "Updated {exact}" date titles; the footer "Sorted by priority, then most recently updated."; the empty copy per C17.
  - Reads: + spec REQ-041–042 · `src/client/screens/MyIssues.tsx`, `IssueCells.tsx`
  - Needs: M17.0, M17.4

- [ ] **M17.13 Members.** Order Members, then Invitations (the invite form inside it, with a "Notification status" link button); mono counts in the headings; no Status column ("(deactivated)" in the name, row in ink-2); "(you)" on your row; the Pending row with a ⋯ menu (Resend, Revoke…), Expired and Bounced with inline Resend plus ⋯; the Pending tag neutral. Copy and actions stay per C14.
  - Reads: + spec REQ-001–007, REQ-051 · `src/client/screens/Members.tsx`
  - Needs: M17.2, M17.4

- [ ] **M17.14 Profile and Notification status.** Profile: an "Account" heading, the name field and Save on one row (Save disabled when unchanged), a Role fact, password feedback beside the button, loading and load-error states. Notification status: Worker and Queue side by side, right-aligned numbers, a row-header Email cell, and the two warnings after 2 min without a pass (C16), with Last seen in accent-2-700.
  - Reads: + spec REQ-052, REQ-053, OPS-005 · `src/client/screens/{Profile,NotificationStatus}.tsx`
  - Needs: M17.0, M17.4

- [ ] **M17.15 Project settings and Labels.** Settings: "Saved." after a rename, and the type-the-key delete kept (C4). Labels (its own page per C3): rows with one ⋯ menu (Rename, Change color…, Delete…), no "Saving…" text on rename (inputs go read-only), "Deleting…" in the delete dialog, and "Create one." as a link.
  - Reads: + spec REQ-009–014, REQ-021 · `src/client/screens/{ProjectSettings,Labels}.tsx`
  - Needs: M17.3

- [ ] **M17.16 List view restyle.** Keep the filters, search, sort and paging (C1). Restyle the rows to match My issues (row-link grid, avatar or dashed "Unassigned", relative time).
  - Reads: + spec REQ-036–040 · `src/client/screens/List.tsx`
  - Needs: M17.4, M17.8

**Done when:** every screen matches its design frames in the browser at 1280 and 1024 px, the spec reflects every accepted change, and the three checks are green.
