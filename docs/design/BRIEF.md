# Tracklite R1 — project brief (applies to every screen prompt)

This project designs the screens of Tracklite, release R1. Every screen prompt builds on this; the user pastes each screen's own rules with that prompt.

## About the product
Tracklite is a small issue tracker for one invite-only team of fewer than about 15 people. They found Linear too complex. It keeps issues inside projects, with comments, a kanban board, a list view, My issues and email notifications. English only. Desktop browsers first: phones work but aren't polished.

Not in R1, so never draw these: keyboard shortcuts, shortcut hints or key caps for shortcuts, a command palette, cycles/sprints/roadmaps, sub-issues or issue links, file attachments or images, in-app notifications or notification settings, activity history, search across projects, public sign-up, multiple workspaces or a workspace switcher, two-factor or "Sign in with Google", integrations, data export, live presence or real-time editing.

"Keyboard-first" means every screen works from the keyboard alone: sensible tab order, visible focus, Enter submits forms, Escape closes dialogs and menus. It doesn't mean shortcuts.

## Design system
Use only the Docket design system attached to this project (bundle and tokens in `_ds/docket-design-system-…`). App-shell, popover, field, dialog and toast markup the kit has no component for lives in `tracklite-app.css`, built on Docket tokens only. Don't invent components, colours, spacing or one-off styles. If a screen needs something the kit lacks, list it at the end of the answer instead of drawing it.
- Voice: plain, specific, matter-of-fact. Help text uses "you"; the product never says "I" or "we". Sentence case everywhere. Buttons are verbs ("Sign in", "Send link"). Feedback is a past-tense fact. Use the ellipsis character (…) and curly quotes. No exclamation marks, no emoji.
- Machine values in mono: issue IDs, dates, counts, relative times.
- Logo: the "lifted card" mark (option 1e in Tracklite logo.dc.html): a board card tilted −9° with a clay border over a faded ink outline card, in Docket ink, surface and eraser, followed by the word Tracklite in Geist at weight 600. Copy the SVG from that file; don't redraw or recolour it. Sidebar head: 22px mark, 17px wordmark. Signed-out header: 26px mark, 20px wordmark.
- Eraser (`--primary`) for interactive and primary. `--danger` only for exceptions: overdue, destructive. Urgent priority uses the Docket PriorityIcon.
- Separate rows and panels with 1px rules, not boxes. No gradients, imagery, illustrations or motion.
- Use the exact copy given in quotes. Server messages appear exactly as written.

## Domain vocabulary
- Members have a full name, a username and an email; avatar is their initials. Role is admin or member. A deactivated member is shown as "(deactivated)".
- Projects are shown as "Name · KEY", e.g. "Website · WEB". A project can be archived, which makes it read-only.
- Issues are addressed by ID, such as WEB-42. Statuses, always in this order: Backlog, In Progress, In Review, Done, Canceled. Priorities: Urgent, High, Medium, Low, No priority.

## Realistic data (no lorem ipsum)
- Members: Sam Lee (sam@acme.com, username sam, admin), Alex Kim (alex@acme.com, username alex, member). Add others with acme.com emails as needed.
- Project: Website · WEB. Issues: WEB-42 "Fix login button", WEB-43, WEB-5, WEB-7, WEB-9.

## App structure
- Signed-out screens (Sign in, Forgot password, Reset password, Accept invitation) sit outside the app shell, with no sidebar.
- Every signed-in screen uses the same shell. Sidebar, top to bottom: My issues; Projects (active projects as "Name · KEY", with a + for admins that opens New project); Archived projects; Members (admins only); at the bottom the member's initials and name, opening a menu with Profile and Sign out.
- Project screens (board, list, details) have a header: "Name · KEY" with an open-book icon button to its left, vertically centred with the name, that opens project details, Board | List tabs, a settings gear (admins only; project settings include the project's labels) and New issue (hidden when archived). The issue page keeps the same header, including the Board | List tabs with neither one selected; the name becomes a breadcrumb: "Name · KEY" (links to the board) / issue ID. Archived projects show an "Archived" badge and no create or edit controls.

## Standard behaviours (draw them the same way everywhere)
- STD-1 Not signed in: redirect to sign-in, then back to the page asked for.
- STD-2 Not allowed: actions the member can't take are hidden. If reached anyway: "You don't have permission to do that." in the page area.
- STD-3 Invalid input: error shows next to the field, form keeps everything typed, nothing is saved.
- STD-4 Not found: a "Not found" page with a link to My issues.
- STD-5 Submit button is disabled while saving.
- STD-6 If an invitation or password reset email fails: "We couldn't send the email. Try again."
- STD-7 Loading indicator shows only after 300 ms. Empty states name the next action ("No issues yet. Create one."). Load failure shows "Couldn't load this." beside a Retry button.
- STD-9 A failed submission not tied to one field shows a toast that disappears after 5 seconds, with no dismiss or pause control. Form keeps what was typed. Network/server error toast: "Couldn't save. Try again."; otherwise the server's message. One toast at a time.

## How screens are requested
Each screen prompt gives spec rules with numbered examples, layout notes and a list of states. Draw each state as its own frame at desktop width, using the data above. Name each frame after its screen and state, e.g. "Sign in — incorrect password".
