---
product: "Tracklite"
version: "0.20"
release: "R1"
status: Ready to build
updated: "2026-10-05"
---

# Tracklite: Spec

## Overview

### 1. Summary

Tracklite is an issue tracker for my own small, invite-only team, which finds Linear too complex and too expensive for what it needs. It keeps issues inside projects, with comments, a kanban board and a list view, and drops Linear's advanced features, such as cycles, for a smaller, easier tool.

### 2. Features

| ID | Feature | Release | Priority |
|---|---|---|---|
| F-001 | Accounts and sign-in | R1 | Must |
| F-002 | Projects | R1 | Must |
| F-003 | Issues | R1 | Must |
| F-004 | Board view | R1 | Must |
| F-005 | List view | R1 | Should |
| F-006 | Comments | R1 | Must |
| F-007 | My issues | R1 | Should |
| F-008 | Email notifications | R1 | Should |
| F-009 | Project milestones | Later | Could |
| F-010 | Rich text in descriptions and comments | Later | Could |

### 3. Scope limits

- **Out of scope:**
  - Cycles or sprints, and roadmaps
  - Keyboard shortcuts and a command palette
  - Integrations such as GitHub, Slack or outgoing webhooks, and a public API
  - Public sign-up, multiple workspaces, and serving other teams
  - Two-factor authentication, passkeys, and sign-in with Google or other identity providers
  - Custom statuses or per-project workflows: one fixed set of statuses for everyone
  - Sub-issues, and links or dependencies between issues
  - File attachments and images, in descriptions or comments
  - In-app notifications, and notification settings
  - Native mobile apps
  - Real-time collaborative editing
  - Importing from Linear or anything else
  - Moving an issue to another project, since it would change the issue's ID
  - Issue activity history: a log of who changed which field and when
  - Searching or jumping to issues across projects: the list view searches one project, and any issue opens by its address (API-004)
  - Changing a member's email address, by the member or an admin
  - Exporting data: the daily backups (OPS-003) are the only copy outside the app
- **Assumptions:**
  - The team has fewer than about 15 people, so one small server is enough. Confirm against the team's headcount before launch.
  - Everyone reads their work email reliably, since invitations and password resets depend on it.
  - The interface is English only.
- **Known limitations in R1:**
  - No live updates: members see teammates' changes after a reload.
  - Desktop browsers first. Phones work but aren't polished, and dragging cards on the board needs a mouse or trackpad.
  - One VPS holds everything, so any VPS failure takes the whole app down. Daily backups cap data loss at one day (OPS-003).

### 4. Open questions

| ID | Question | Type | Affects |
|---|---|---|---|
| DEC-002 | Exact API endpoints and request and response shapes | Agent's choice (limits in section 12) | API-001 |
| DEC-003 | Which transactional email provider to use | Agent's choice (limits in section 12) | API-002, API-003, NFR-008, NFR-009 |
| DEC-004 | How background jobs run | Agent's choice (limits in section 12) | REQ-045, STD-6 |

DEC-002, DEC-003 and DEC-004 are settled in `docs/tech-design.md` (sections 3, 5 and 1.4 respectively).

### 5. Glossary

- **Member:** a person with an account.
- **Admin:** a member who can invite people and manage members and projects (section 7).
- **Invitation:** an admin's email invite, the only way to join.
- **Password:** a secret the member chooses and uses, with their email, to sign in.
- **Password reset link:** a one-time link sent by email to choose a new password.
- **Session:** a member's signed-in state in one browser.
- **Project:** a named container for issues.
- **Project key:** a short uppercase code such as `WEB`, fixed when the project is created.
- **Archived project:** a project an admin has made read-only and moved from the sidebar to the Archived projects page.
- **Project details:** a project's page for its description and comments, opened from a link next to the project name.
- **Issue:** a unit of work.
- **Issue ID:** the project key plus a number, such as `WEB-42`.
- **Status:** where an issue is in the workflow; the columns on the board.
- **Label:** a tag on an issue, belonging to one project.
- **Priority:** how urgent an issue is.
- **Assignee:** the member responsible for an issue.
- **Board:** a project's issues shown as cards in one column per status.
- **Comment:** a message on an issue or a project.
- **Mention:** an `@username` in an issue description, a project description or a comment that notifies that member (DATA-001).
- **Notification:** an email telling a member they were assigned or mentioned.

## Features

### F-001 Accounts and sign-in

**Release:** R1 · **Priority:** Must

**What and why:** Members sign in with their email and a password they choose, and only people an admin invites can join. A forgotten password is reset through a link sent by email. Each member has a simple profile so teammates can recognise and @mention them.

**Flow**

1. An admin enters a person's email and sends an invitation.
2. The system emails that person an invitation link.
3. The person opens the link, fills in their profile, chooses a password, and is signed in as a member.
4. Later, the member enters their email and password on the sign-in page.
5. The member is signed in, landing on My issues, or on the page they were trying to reach (STD-1).
6. A member who forgets their password clicks **Forgot password?**, enters their email, opens the reset link the system emails them, and chooses a new password.
7. The member can edit their full name and change their password at any time. Username and email are fixed.
8. Admins manage members, roles and invitations on the members page.

**Rules and examples**

- **REQ-001** When an admin invites an email address, the system shall email a single-use invitation link that expires after 7 days, and the admin can resend or revoke it. Emails are compared ignoring capitals, and an address that isn't a valid email gets the field error "Enter a valid email". If the email belongs to an active member, the system shall refuse with "Already a member". If it belongs to a deactivated member, it shall refuse with "This person is deactivated. Reactivate them instead." If the email can't be sent, nothing is saved (a resent invitation keeps its previous link) and the admin sees "We couldn't send the email. Try again." (STD-6).
  - REQ-001.1: Admin invites `sam@acme.com` → email sent; the invitation shows as Pending. (Verify: auto)
  - REQ-001.2: Admin invites an existing member's email → "Already a member", no email. (Verify: auto)
  - REQ-001.3: Admin resends Sam's pending invitation → a new link is sent and the old link stops working. (Verify: auto)
  - REQ-001.4: Admin revokes Sam's invitation → the link stops working. (Verify: auto)
  - REQ-001.5: Admin invites `Sam@Acme.com` while `sam@acme.com` is a member → "Already a member". (Verify: auto)
  - REQ-001.6: Admin invites the email of deactivated member Jo → "This person is deactivated. Reactivate them instead.", no email. (Verify: auto)
  - REQ-001.7: The email service is down when the admin invites `sam@acme.com` → "We couldn't send the email. Try again."; no invitation is listed. (Verify: auto)
- **REQ-002** When a person who isn't signed in opens a valid invitation link, the system shall ask for their profile and a password (REQ-048), create them as a member, and sign them in. If a signed-in member opens an invitation link, the system shall ask them to sign out first. If the invitation expires or is revoked before the profile is submitted, no member is created.
  - REQ-002.1: Sam opens the link on day 3 and enters "Sam Lee", `sam` and a valid password → member created, signed in, lands on My issues. (Verify: auto)
  - REQ-002.2: Sam opens the link on day 8, or after already accepting it → "This invitation has expired. Ask an admin for a new one." (Verify: auto)
  - REQ-002.3: Alex, signed in, opens Sam's invitation link → "You're signed in as Alex. Sign out to accept this invitation." (Alex's full name is shown) (Verify: auto)
  - REQ-002.4: The admin revokes the invitation while Sam is filling in the profile → on submit: "This invitation is no longer valid.", no member created. (Verify: auto)
- **REQ-003** The system shall store each profile as a full name (1 to 60 characters; whitespace at either end is trimmed; a name that is empty or only whitespace gets the field error "Name required", and one over 60 characters after trimming gets "Too long (max 60)" (STD-3)), a unique username (2 to 20 characters: lowercase letters, digits, hyphens; used for @mentions; capitals are lowercased, and anything else gets the field error "Use 2 to 20 letters, digits or hyphens") and the invited email. The avatar is the member's initials. Username and email can't be changed in R1.
  - REQ-003.1: Sam enters username `Sam` → saved as `sam`. (Verify: auto)
  - REQ-003.2: Username `sam` is already taken → field error "Username taken" (STD-3). (Verify: auto)
  - REQ-003.3: Sam opens their profile → the full name can be edited and the password changed (REQ-049); username and email are shown but can't be edited, and an API request that changes them is refused. (Verify: auto)
  - REQ-003.4: The initials are the first character of the first word and the first character of the last word of the full name, whatever that character is (a letter in any script, a digit or punctuation), uppercased where uppercasing applies: "Alexandria Catherine Montgomery-Fitzwilliam van der Bergholt" → "AB"; a one-word name such as "Sam" → "S"; "(Contractor) Lee" → "(L"; "3M Team" → "3T"; "李 小龙" → "李小". (Verify: auto)
- **REQ-047** When someone enters an email and password on the sign-in page, the system shall sign them in only if the email, compared ignoring capitals, belongs to an active member and the password matches. It then sends them to the page they were trying to reach (STD-1), or to My issues. Otherwise it shows "Incorrect email or password." beside the form, the same for an unknown email, a wrong password and a deactivated member; the email stays filled in and the password field is cleared. Attempts are limited by SEC-001.
  - REQ-047.1: `sam@acme.com` (active member) with the right password → signed in, lands on My issues. (Verify: auto)
  - REQ-047.2: `sam@acme.com` with a wrong password → "Incorrect email or password."; the email is kept and the password cleared. (Verify: auto)
  - REQ-047.3: `stranger@x.com` with any password → the same "Incorrect email or password.". (Verify: auto)
  - REQ-047.4: `Sam@Acme.com` with Sam's password → signed in as Sam. (Verify: auto)
  - REQ-047.5: Sam, signed out, opens `/issue/WEB-42`, is sent to sign-in and signs in → lands on `WEB-42`. (Verify: auto)
- **REQ-048** A password shall be 12 to 128 characters. Any characters are allowed, including spaces; nothing is trimmed, and there are no rules about character types. Too short gets the field error "At least 12 characters", too long gets "Too long (max 128)" (STD-3). These rules apply wherever a password is set: accepting an invitation (REQ-002), changing it (REQ-049) and resetting it (REQ-050). Passwords are stored as SEC-008 requires.
  - REQ-048.1: `correct horse battery` (21 characters, with spaces) → accepted. (Verify: auto)
  - REQ-048.2: `Sh0rt!pass` (10 characters) → field error "At least 12 characters". (Verify: auto)
  - REQ-048.3: A 129-character password → field error "Too long (max 128)". (Verify: auto)
  - REQ-048.4: A password chosen as ` secret phrase 1 ` (leading and trailing spaces) → only that exact text, spaces included, signs in. (Verify: auto)
- **REQ-049** When a member changes their password from their profile, the system shall require their current password and a new one (REQ-048). A wrong current password gets the field error "Incorrect password" and nothing changes. On success, the member stays signed in on this browser and all their other sessions end, and the profile shows "Password changed. You've been signed out everywhere else."
  - REQ-049.1: Sam enters the right current password and a valid new one → saved; Sam stays signed in here and is signed out on their other computer. (Verify: auto)
  - REQ-049.2: Sam enters a wrong current password → field error "Incorrect password"; the old password still works. (Verify: auto)
  - REQ-049.3: Someone using Sam's session enters 10 wrong current passwords within an hour → the 11th try shows "Too many attempts. Try again later." even with the right password (SEC-001). (Verify: auto)
- **REQ-050** When someone clicks **Forgot password?** on the sign-in page and enters an email, the system shall email a single-use password reset link that expires after 30 minutes, only if the email belongs to an active member. The page shows "Check your email" either way, and requests are limited by SEC-001. Opening a valid link shows a form for a new password without using up the link. An expired, used, unknown or malformed link shows "This link has expired" with a button to request a new one, straight away and without the form. Submitting fails the same way if the link expired meanwhile or the member has been deactivated since (REQ-007). Submitting a valid new password (REQ-048) uses the link, sets the password, ends all of that member's sessions, signs them in on this browser and sends them to My issues. A successful reset also stops the member's other outstanding reset links from working. The link works in any browser.
  - REQ-050.1: `sam@acme.com` (active member) → email sent; the page shows "Check your email". (Verify: auto)
  - REQ-050.2: `stranger@x.com` → no email; the page shows the same "Check your email". (Verify: auto)
  - REQ-050.3: Sam opens the link 10 minutes after it was sent and enters a valid new password → the new password is set, Sam is signed in and lands on My issues, and the old password no longer works. (Verify: auto)
  - REQ-050.4: The form is submitted after 31 minutes, or the link was already used → "This link has expired" with a button to request a new one; the password is unchanged. (Verify: auto)
  - REQ-050.5: A mail scanner opens the link, then Sam submits a new password → the password is set. (Verify: auto)
  - REQ-050.6: Sam requests two links a minute apart and resets with the second → the first link shows "This link has expired". (Verify: auto)
  - REQ-050.7: Sam is signed in on another computer and resets the password → that other session ends. (Verify: auto)
  - REQ-050.8: Alex, signed in, opens a reset link (anyone's, or an unknown or malformed one) → "You're signed in as Alex. Sign out to reset a password." (Alex's full name is shown) with a Sign out button, revealing nothing about the link; the link isn't used, and a valid link still works after Alex signs out. (Verify: auto)
  - REQ-050.9: Someone who isn't signed in opens a malformed link, or a link 31 minutes after it was sent → "This link has expired" with a button to request a new one; no password form. (Verify: auto)
- **REQ-006** A session shall last 30 days from the member's last activity. Signing out ends the session on that browser only.
  - REQ-006.1: Sam uses the app every day → stays signed in. (Verify: auto)
  - REQ-006.2: Sam returns after 31 days away → sign-in page (STD-1). (Verify: auto)
- **REQ-007** When an admin deactivates a member, the system shall ask "{Full name} will be signed out and can't sign in until reactivated." to confirm, then end all of that member's sessions immediately and block their sign-in. Their name stays on past work, marked "(deactivated)", and they can't be assigned or mentioned. The last admin can't be deactivated or lose the admin role.
  - REQ-007.1: Admin deactivates Sam → Sam's next page load goes to sign-in; signing in with Sam's correct password shows "Incorrect email or password.", and a password reset request sends nothing. (Verify: auto)
  - REQ-007.2: `WEB-42` was assigned to Sam → it still shows "Sam Lee (deactivated)", and Sam isn't in the assignee picker. (Verify: auto)
  - REQ-007.3: The only admin tries to deactivate themselves, or remove their own admin role → blocked with "There must be at least one admin." (Verify: auto)
  - REQ-007.4: Sam is deactivated while editing the description of `WEB-42` → Sam's save fails and goes to sign-in, and nothing is saved. (Verify: auto)
  - REQ-007.5: Sam requests a password reset link, is deactivated, then submits a new password through the link → "This link has expired"; the password is unchanged and Sam isn't signed in. (Verify: auto)
- **REQ-008** When an admin reactivates a deactivated member, the system shall let them sign in again with their existing profile. They can be assigned and mentioned again.
  - REQ-008.1: Admin reactivates Sam, then Sam signs in with their existing password → signed in with the same username and profile. (Verify: auto)
  - REQ-008.2: `WEB-42` is still assigned to Sam → "(deactivated)" disappears from Sam's name, and Sam is back in the assignee picker. (Verify: auto)
- **REQ-051** The system shall give admins a members page, `/settings/members`, listing members and invitations. Each member row shows the full name, username, email, role and whether they're deactivated, with actions to deactivate or reactivate (REQ-007, REQ-008) and to make admin or remove admin (REQ-052). A deactivated member's only action is reactivate. Each invitation that's Pending, Bounced or Expired shows the email, who sent it and when it expires or expired, with Resend and Revoke (REQ-001); accepted and revoked invitations aren't listed. Members who aren't admins can't open the page (STD-2).
  - REQ-051.1: An admin opens `/settings/members` → every member with their role, and Sam's pending invitation with Resend and Revoke. (Verify: auto)
  - REQ-051.2: Alex, a member, opens `/settings/members` → "You don't have permission to do that." (Verify: auto)
  - REQ-051.3: An admin resends Sam's expired invitation → a new link valid for 7 days is sent, and the row shows Pending. (Verify: auto)
- **REQ-052** When an admin makes a member an admin, or removes a member's admin role, the system shall apply it from that member's next request, without signing them out. The last admin keeps the role (REQ-007), even when two admins act at the same moment.
  - REQ-052.1: An admin makes Sam an admin → on Sam's next page load, admin controls such as **New project** appear. (Verify: auto)
  - REQ-052.2: An admin removes Jo's admin role while Jo has project settings open → Jo's next save is refused with "You don't have permission to do that." (STD-2). (Verify: auto)
  - REQ-052.3: Alex and Jo, the only two admins, remove each other's admin role at the same moment → one change succeeds and the other is refused, so one admin remains. (Verify: auto)

**Exceptions to standard behaviors:** None.
**Uses:** Member, Invitation, Password reset link, Session · SEC-001 (sign-in limits), SEC-003 (tokens), SEC-008 (password storage), SEC-009 (return after sign-in), OPS-001 (first-admin setup)

### F-002 Projects

**Release:** R1 · **Priority:** Must

**What and why:** A project groups related issues under a short key that gives every issue a readable ID, with a Markdown description explaining what the project is for. Admins decide which projects exist, and every member can keep the descriptions current.

**Flow**

1. An admin creates a project with a name and a key such as `WEB`.
2. The project appears in the sidebar for every member.
3. A member opens the project and sees its issues on the board or list. A link next to the project name opens the project details, with its description and comments.
4. Any member edits the description in Markdown.
5. An admin renames the project, archives it when the work is finished, or deletes it.

**Rules and examples**

- **REQ-009** When an admin creates a project, the system shall require a name (1 to 50 characters after whitespace at either end is trimmed; names may repeat; an empty name gets the field error "Name required" and a longer one gets "Too long (max 50)" (STD-3)) and a key (2 to 5 letters A to Z, stored in uppercase). The key can never have been used by another project, including archived and deleted ones. The new project appears for every member.
  - REQ-009.1: Admin creates "Website" with key `WEB` → project created, shown in every member's sidebar. (Verify: auto)
  - REQ-009.2: Admin enters key `web` → saved as `WEB`. (Verify: auto)
  - REQ-009.3: Key `WEB` was used by a project that has since been deleted → field error "Key already used" (STD-3). (Verify: auto)
  - REQ-009.4: Key `W`, `WEB1` or `ÉQ` → field error "Key must be 2 to 5 letters". (Verify: auto)
  - REQ-009.5: Admin creates a second project named "Website" with key `SITE` → created. (Verify: auto)
- **REQ-010** The system shall not let anyone change a project's key after the project is created. A request that changes it gets the field error "Key can't be changed" (STD-3). Admins rename, archive and delete a project on its settings page, `/project/{KEY}/settings`.
  - REQ-010.1: Admin opens project settings → the key is shown but can't be edited; an API request that changes it is refused and the key stays `WEB`. (Verify: auto)
- **REQ-011** When an admin renames a project, the system shall keep its key and every issue ID unchanged.
  - REQ-011.1: "Website" is renamed to "Marketing site" → `WEB-42` is still `WEB-42`, and old links still work. (Verify: auto)
- **REQ-012** When any member edits a project description, the system shall save it as Markdown of up to 20,000 characters (empty allowed) and show it formatted (DEC-001, SEC-002). @mentions follow DATA-001, and two members editing at once is handled by STD-8.
  - REQ-012.1: Member saves a description with a heading and a bullet list → shown formatted. (Verify: auto)
  - REQ-012.2: Description of 20,001 characters → field error "Too long (max 20,000)". (Verify: auto)
  - REQ-012.3: Description contains `<script>alert(1)</script>` → shown as text; nothing runs. (Verify: auto)
- **REQ-013** When an admin archives a project, the system shall move it from the sidebar to an Archived list. It shall make its name, description, issues, comments and labels read-only, and hide its issues from My issues. An admin can unarchive it. With no archived projects, the Archived list shows "No archived projects." (STD-7)
  - REQ-013.1: Admin archives `WEB` → it disappears from the sidebar and appears under Archived; `WEB-42` opens read-only, with no edit or comment controls. (Verify: auto)
  - REQ-013.2: `WEB-42` is assigned to Sam → it no longer appears in Sam's My issues. (Verify: auto)
  - REQ-013.3: Admin unarchives `WEB` → it's back in the sidebar and fully editable, and `WEB-42` is back in Sam's My issues. (Verify: auto)
  - REQ-013.4: Sam is editing `WEB-42` when `WEB` is archived → Sam's save fails with the toast "This project is archived" (STD-9), and Sam's text is kept. (Verify: auto)
  - REQ-013.5: `WEB` is archived → its Labels page still lists the labels, with no create, rename, recolor or delete controls. (Verify: auto)
  - REQ-013.6: Sam has `WEB`'s Labels page open when `WEB` is archived, then renames `bug` → the toast "This project is archived" (STD-9), and `bug` is unchanged. (Verify: auto)
  - REQ-013.7: `WEB` is archived → its settings page shows the name with no Save; a rename request is refused with "This project is archived" and the name is unchanged. (Verify: auto)
- **REQ-014** When an admin deletes a project, active or archived, the system shall ask them to type the project key to confirm, then permanently delete the project with all its issues and comments (DATA-002). Nothing can be restored.
  - REQ-014.1: Admin types `WEB` and confirms → project gone; opening `WEB-42` shows Not found (STD-4). (Verify: auto)
  - REQ-014.2: Admin types `WEBB` → the Delete button stays disabled. (Verify: auto)
  - REQ-014.3: Sam is viewing `WEB-42` when `WEB` is deleted → Sam's next action shows Not found (STD-4). (Verify: auto)
  - REQ-014.4: Admin deletes archived project `OLD` → deleted, the same as an active project. (Verify: auto)
- **REQ-015** The system shall list active projects in the sidebar as name and key ("Website · WEB"), sorted by name and then by key. A name too long to fit is cut off with "…" and shown in full on hover.
  - REQ-015.1: Projects "Website", "API" and "Mobile" → shown as API, Mobile, Website. (Verify: auto)
  - REQ-015.2: A 50-character name → cut off with "…"; hovering shows the full name. (Verify: manual)
  - REQ-015.3: Two projects named "Website", with keys `WEB` and `SITE` → shown as "Website · SITE", then "Website · WEB". (Verify: auto)
- **REQ-046** The system shall show a project's description and comments on its project details page, `/project/{KEY}/detail`. A link or icon next to the project name, at the top of the board and the list view, opens it. The board and list view don't show the description or the project's comments.
  - REQ-046.1: Sam clicks the details link next to "Website" on the `WEB` board → `/project/WEB/detail` opens, with the description and the project's comments. (Verify: auto)
  - REQ-046.2: Sam opens the `WEB` board → no description or project comments on it. (Verify: auto)

**Exceptions to standard behaviors:** None.
**Uses:** Project, Issue, Comment · DEC-001 (Markdown) · DATA-001 (mentions), DATA-002 (deletion) · SEC-002 (safe Markdown)

### F-003 Issues

**Release:** R1 · **Priority:** Must

**What and why:** An issue is one piece of work in a project, with a readable ID, a Markdown description, and the fields the team uses to track it: status, priority, assignee and labels. Every view in the app is built on issues.

**Flow**

1. A member clicks **New issue** in a project and enters a title.
2. The system gives it the project's next ID, such as `WEB-43`, and a starting status.
3. The member adds a description, priority, assignee and labels, now or later.
4. Any member opens the issue by its ID to read it, comment on it and change its fields.
5. As the work progresses, members move it through the statuses until it's done or canceled.
6. The issue's creator or an admin can delete it.

**Rules and examples**

- **REQ-016** When a member creates an issue, or edits its title, the system shall require a title of 1 to 200 characters (whitespace at either end is trimmed; an empty title gets the field error "Title required" and a longer one gets "Too long (max 200)" (STD-3)). A new issue gets the project's next number, starting at 1. No two issues in a project ever share a number, and numbers are never reused. A new issue starts as status Backlog, No priority, unassigned, and the system records who created it and when. The issue's ID is its address, matched ignoring capitals.
  - REQ-016.1: Sam creates "Fix login button" as the first issue in `WEB` → `WEB-1`, Backlog, No priority, unassigned, "Created by Sam Lee". (Verify: auto)
  - REQ-016.2: The latest issue is `WEB-41` and `WEB-40` was deleted → the next new issue is `WEB-42`. (Verify: auto)
  - REQ-016.3: The title is only spaces → field error "Title required" (STD-3). (Verify: auto)
  - REQ-016.4: Sam and Alex create an issue in `WEB` at the same moment → one gets `WEB-42` and the other `WEB-43`. (Verify: auto)
  - REQ-016.5: A member opens `/issue/web-42` → `WEB-42` opens. (Verify: auto)
- **REQ-017** The system shall offer one fixed set of statuses, in this order: **Backlog, In Progress, In Review, Done, Canceled**. Any member can move an issue to any status at any time.
  - REQ-017.1: `WEB-42` is moved from Backlog straight to Done → allowed. (Verify: auto)
- **REQ-018** The system shall offer these priorities: **No priority, Urgent, High, Medium, Low**.
  - REQ-018.1: Sam sets `WEB-42` to Urgent → `WEB-42` shows Urgent. (Verify: auto)
- **REQ-019** An issue shall have no assignee or one active member as its assignee. Anyone else gets the field error "Choose an active member" (STD-3).
  - REQ-019.1: Sam assigns `WEB-42` to Alex → shows Alex. (Verify: auto)
  - REQ-019.2: Sam clears the assignee → shows Unassigned. (Verify: auto)
- **REQ-020** An issue shall have 0 to 10 labels, chosen from its project's labels. In the label picker, typing a name that matches an existing label, ignoring capitals, adds that label; any other name creates the label in the project, colored Gray, and adds it.
  - REQ-020.1: Sam adds `bug` and `frontend` to `WEB-42` → both shown. (Verify: auto)
  - REQ-020.2: Sam types `Design`, which doesn't exist in `WEB` yet → label `Design` created in `WEB` and added. (Verify: auto)
  - REQ-020.3: Sam tries to add an 11th label → "Maximum 10 labels". (Verify: auto)
  - REQ-020.4: Sam adds `frontend` just as another member deletes it → the toast "That label no longer exists" (STD-9); Sam's other changes are kept. (Verify: auto)
  - REQ-020.5: Sam types `design` while `Design` exists in `WEB` → `Design` is added; no new label is created. (Verify: auto)
- **REQ-021** Any member shall be able to create, rename, recolor and delete a project's labels on that project's Labels page. A label has a name of 1 to 30 characters (whitespace at either end is trimmed), unique within its project ignoring capitals, and one of 8 preset colors: Gray, Red, Orange, Yellow, Green, Blue, Purple and Pink. An empty name gets the field error "Name required", a longer one gets "Too long (max 30)", and any other color gets "Choose a color" (STD-3). Renaming or deleting a label affects every issue in that project that has it. Deleting a label asks for confirmation, naming how many issues have it.
  - REQ-021.1: `bug` is renamed to `defect` → every issue in the project that had `bug` now shows `defect`. (Verify: auto)
  - REQ-021.2: A member creates `BUG` while `bug` exists in the same project → field error "Label already exists". (Verify: auto)
  - REQ-021.3: `frontend` is deleted → it's removed from all of the project's issues, and the issues stay otherwise unchanged. (Verify: auto)
  - REQ-021.4: `bug` exists in `WEB`; a member creates `bug` in `API` → allowed; they're separate labels, and renaming one doesn't change the other. (Verify: auto)
  - REQ-021.5: Sam deletes `frontend`, which 12 issues have → "Delete frontend? It will be removed from 12 issues."; on confirming, it's deleted. (Verify: auto)
- **REQ-022** When a member edits an issue description, the system shall save it as Markdown of up to 20,000 characters (empty allowed) and show it formatted (DEC-001, SEC-002). @mentions follow DATA-001, and two members editing at once is handled by STD-8.
  - REQ-022.1: Sam saves a description with a checklist and a code block → shown formatted. (Verify: auto)
  - REQ-022.2: Description of 20,001 characters → field error "Too long (max 20,000)". (Verify: auto)
- **REQ-023** When the issue's creator or an admin deletes an issue, the system shall ask for confirmation ("Delete WEB-42?" with "“Fix login button” and its comments will be deleted permanently. You can’t undo this."), then permanently delete it with its comments (DATA-002). Its number is not reused.
  - REQ-023.1: Sam deletes `WEB-42`, which Sam created, and confirms → gone; opening `WEB-42` shows Not found (STD-4). (Verify: auto)
  - REQ-023.2: Alex, a member, views `WEB-42`, which Sam created → no Delete option (STD-2). (Verify: auto)
  - REQ-023.3: Alex is writing a comment on `WEB-42` when it's deleted → on save, the toast "This issue was deleted" (STD-9), and Alex's text stays in the box. (Verify: auto)

**Exceptions to standard behaviors:** None.
**Uses:** Issue, Project, Label, Member · DEC-001 (Markdown) · DATA-001 (mentions), DATA-002 (deletion) · SEC-002 (safe Markdown)

### F-004 Board view

**Release:** R1 · **Priority:** Must

**What and why:** The board shows a project's issues as cards in one column per status, so the team sees the state of the work at a glance and moves it forward by dragging. It's the view a project opens on.

**Flow**

1. A member opens a project, and the board shows one column per status, from Backlog to Canceled.
2. Each card shows the issue ID, title, priority, assignee and labels.
3. The member drags a card to another column, or to a new place in the same column.
4. The system saves the new status and position straight away.
5. The member clicks a card to open the issue.
6. The member clicks **+** at the top of a column to create an issue that starts in that column's status.

**Rules and examples**

- **REQ-024** When a member opens a project, the system shall show its board: one column per status in the REQ-017 order, each headed by its name and issue count. Each column scrolls on its own, and dragging near a column's top or bottom edge scrolls it.
  - REQ-024.1: `WEB` has 3 Backlog and 2 In Progress issues → columns Backlog (3), In Progress (2), In Review (0), Done (0), Canceled (0). (Verify: auto)
  - REQ-024.2: `WEB` is archived → the board shows no **+** buttons, cards can't be moved, and cards open read-only (REQ-013). (Verify: auto)
  - REQ-024.3: Backlog has 300 cards → Backlog scrolls on its own while the other columns stay put. (Verify: manual)
- **REQ-025** Each card shall show the issue ID, the title (cut off after 2 lines), the priority, the assignee's initials, and up to 3 labels followed by "+N" for the rest.
  - REQ-025.1: `WEB-42` has 5 labels → the card shows 3 labels and "+2". (Verify: auto)
  - REQ-025.2: `WEB-42` is unassigned with No priority → no initials or priority icon on the card. (Verify: auto)
- **REQ-026** When a member drops a card in a new place, the system shall save straight away both the card's status and its place relative to its neighbouring cards, then refresh the columns involved. If two saves touch the same card, the last one wins (STD-8). If the save fails, the card returns to its old place and a toast appears (STD-9).
  - REQ-026.1: Sam drags `WEB-42` from Backlog to In Progress → status In Progress; after a reload it's still there. (Verify: auto)
  - REQ-026.2: The network drops during the save → the card goes back to its old place in Backlog, with the toast "Couldn't move WEB-42". (Verify: auto)
  - REQ-026.3: Sam moves `WEB-5` and Alex moves `WEB-9` within In Progress at about the same time → both moves are kept. (Verify: auto)
  - REQ-026.4: Alex has moved `WEB-42` to Done; Sam, on an older board, drags it to In Review → `WEB-42` is In Review, and Sam's Done and In Review columns refresh. (Verify: auto)
  - REQ-026.5: Sam drags `WEB-42` after another member deleted it → the toast "This issue was deleted" (STD-9), and the card is removed from Sam's board. (Verify: auto)
- **REQ-027** Within a column, the system shall keep cards in an order that any member can change by dragging. Everyone sees the same order. A new issue, or one whose status is changed anywhere other than the board, goes to the top of its column.
  - REQ-027.1: Sam drags `WEB-9` above `WEB-5` in In Progress → after a reload, Alex also sees `WEB-9` above `WEB-5`. (Verify: auto)
  - REQ-027.2: Sam drags `WEB-42` from Backlog and drops it between `WEB-5` and `WEB-9` in In Progress → it's In Progress, between those two. (Verify: auto)
  - REQ-027.3: Sam clicks **+** on Backlog and creates `WEB-43` → it's at the top of Backlog. (Verify: auto)
  - REQ-027.4: Alex changes `WEB-12` to In Review on the issue page → it's at the top of In Review. (Verify: auto)
- **REQ-028** The Done and Canceled columns shall show only issues moved there in the last 14 days. Older ones stay reachable through the list view (F-005) and by ID.
  - REQ-028.1: `WEB-10` was moved to Done 20 days ago → not on the board; still found in the list view. (Verify: auto)
  - REQ-028.2: `WEB-11` was moved to Done 3 days ago → shown in Done. (Verify: auto)
- **REQ-029** When a member creates an issue with a column's **+** button, the system shall give the new issue that column's status. This is a deliberate exception to REQ-016's starting status.
  - REQ-029.1: Sam clicks **+** on In Review and enters "Update pricing copy" → `WEB-43`, status In Review. (Verify: auto)
- **REQ-030** Each card shall have a **⋯** menu, reachable by keyboard, with **Move to** (a status), **Move to top** and **Move to bottom**. These do the same as a drag. On touch screens, this menu is how cards are moved; dragging isn't required to work there.
  - REQ-030.1: Sam uses **⋯ → Move to → In Review** on `WEB-42` → `WEB-42` is at the top of In Review. (Verify: auto)
  - REQ-030.2: Sam uses **⋯ → Move to bottom** on `WEB-5` in In Progress → `WEB-5` is last in In Progress. (Verify: auto)
  - REQ-030.3: On a phone, Sam moves `WEB-42` to Done with the **⋯** menu → status Done. (Verify: manual)

**Exceptions to standard behaviors:** None.
**Uses:** Issue, Project · REQ-013 (archived), REQ-016 (starting status), REQ-017 (status order) · STD-8, STD-9 · NFR-002, NFR-005

### F-005 List view

**Release:** R1 · **Priority:** Should

**What and why:** The list view shows a project's issues as a table that members can filter and search. It's for finding what the board makes hard to see, such as issues finished weeks ago or everything assigned to one person.

**Flow**

1. A member opens a project and switches from **Board** to **List**.
2. The system shows every issue in the project as a row: ID, title, status, priority, assignee, labels and last updated.
3. The member narrows the list with filters for status, assignee, priority and label, or types words to search.
4. The table updates as they filter or type.
5. The member clicks a column heading to sort by it.
6. The member clicks a row to open the issue.

**Rules and examples**

- **REQ-036** When a member opens the list view, the system shall show every issue in the project, including all Done and Canceled ones, newest-updated first. Rows load 100 at a time as the member scrolls. A title too long for one line is cut off with "…" and shown in full on hover. "Last updated" means the last change to any field or the description; comments don't count, and neither does reordering a card within its column (a status change made by dragging does count).
  - REQ-036.1: `WEB` has 120 issues, 40 of them Done → the first 100 rows show, and the other 20 load on scrolling down. (Verify: auto)
  - REQ-036.2: `WEB-10` was Done 20 days ago → it's in the list (compare REQ-028). (Verify: auto)
  - REQ-036.3: `WEB` is archived → the list, filters, search and sort all work; rows open read-only (REQ-013). (Verify: auto)
  - REQ-036.4: A 200-character title → one line ending in "…"; hovering shows the full title. (Verify: manual)
  - REQ-036.5: Sam drags `WEB-9` above `WEB-5` within In Progress → `WEB-9`'s last updated is unchanged; dragging it to In Review does change it. (Verify: auto)
- **REQ-037** The system shall offer filters for status, assignee, priority and label. The assignee filter lists Unassigned, active members, and any deactivated member who still has issues in the project, marked "(deactivated)". Several values within one filter match any of them. Different filters must all match.
  - REQ-037.1: Status = In Progress and In Review, and Assignee = Sam → only Sam's issues that are in either status. (Verify: auto)
  - REQ-037.2: Assignee = Unassigned → only issues with no assignee. (Verify: auto)
  - REQ-037.3: Label = `bug` and `frontend` → issues with either label. (Verify: auto)
  - REQ-037.4: Nothing matches → "No issues match these filters", with a **Clear filters** button (STD-7). (Verify: auto)
  - REQ-037.5: Jo is deactivated and still assigned to `WEB-7` → the assignee filter offers "Jo Park (deactivated)", and choosing it shows `WEB-7`. (Verify: auto)
- **REQ-038** When a member types in the search box, the system shall update the list 300 ms after they stop typing. It shows issues whose ID, title or description contains every word typed, ignoring capitals. Everything typed is plain text, with no wildcards or query syntax. Comments aren't searched.
  - REQ-038.1: "login button" → `WEB-1` "Fix login button", plus any issue whose description has both words. (Verify: auto)
  - REQ-038.2: "42" or "web-42" → `WEB-42`. (Verify: auto)
  - REQ-038.3: A word that only appears in a comment → that issue isn't shown. (Verify: auto)
  - REQ-038.4: "100%" → only issues containing the text "100%"; `%` isn't a wildcard. (Verify: auto)
- **REQ-039** When a member clicks the ID, Status, Priority or Last updated heading, the system shall sort by that column. Clicking again reverses the order. Status sorts in the REQ-017 order and priority from Urgent down; ties go to the most recently updated.
  - REQ-039.1: Sam clicks Priority → Urgent issues first and No priority last; clicking again → the reverse. (Verify: auto)
  - REQ-039.2: `WEB-3` and `WEB-7` are both Urgent, and `WEB-7` was updated more recently → `WEB-7` comes first. (Verify: auto)
- **REQ-040** The system shall keep the filters, search and sort in the page address, so a reload keeps them and a copied link opens the same view. Values in a link that don't exist, such as a deleted label, an unknown status or an unknown username, are ignored, and the rest still applies.
  - REQ-040.1: Sam filters Assignee = Alex, sorts by Priority, and sends the link to Alex → Alex opens the same filtered, sorted list. (Verify: auto)
  - REQ-040.2: A link filters by label `frontend`, which has since been deleted, and by Status = Done → only the Done filter applies. (Verify: auto)
  - REQ-040.3: A link has `status=Todo` → that value is ignored; the list shows as if no status filter was set. (Verify: auto)

**Exceptions to standard behaviors:** None.
**Uses:** Issue, Label, Member · REQ-007, REQ-013, REQ-017, REQ-028 · STD-7 · API-004 · NFR-004

### F-006 Comments

**Release:** R1 · **Priority:** Must

**What and why:** Members discuss an issue or a project in a thread of Markdown comments beneath it, which keeps decisions next to the work. An @mention brings a teammate into the conversation.

**Flow**

1. A member opens an issue, or a project's details, and goes to its comments.
2. The member writes a comment in Markdown, @mentioning teammates if needed, and posts it.
3. The system adds it to the thread with the author's name and the time.
4. Anyone mentioned gets an email (F-008).
5. The author can edit or delete their own comment, and an admin can delete any comment.

**Rules and examples**

- **REQ-031** When a member posts a comment on an issue or a project, the system shall save it as Markdown of 1 to 10,000 characters and show it formatted (DEC-001, SEC-002). It shows the author's name and initials and when it was posted: relative for the past 7 days ("5 min ago"), a date after that, and the exact date and time on hover. Content wider than the comment scrolls sideways inside it. @mentions follow DATA-001, and a double submit is handled by STD-5.
  - REQ-031.1: Sam posts "Looks good. @alex can you review?" on `WEB-42` → shown with "Sam Lee · just now", and `@alex` is highlighted as a mention. (Verify: auto)
  - REQ-031.2: The comment box is empty or only spaces → the Post button is disabled. (Verify: auto)
  - REQ-031.3: A comment of 10,001 characters → field error "Too long (max 10,000)". (Verify: auto)
  - REQ-031.4: A comment posted 9 days ago → shows its date, such as "Sep 20"; one from a previous year shows "Sep 20, 2025". (Verify: auto)
  - REQ-031.5: A comment has a 300-character line of code → the code block scrolls sideways; the page doesn't. (Verify: manual)
- **REQ-032** The system shall show all of an issue's comments below its description, and all of a project's comments below its description on the project details page (REQ-046), with no paging. Each thread is flat (no replies), oldest first.
  - REQ-032.1: Comments posted on `WEB-42` at 09:00 and 09:05 → the 09:00 comment is above. (Verify: auto)
  - REQ-032.2: Alex comments on project `WEB` → shown on the `WEB` project details page, not on any issue. (Verify: auto)
  - REQ-032.3: `WEB` is archived → its threads are shown with no comment box and no Edit or Delete options (REQ-013). (Verify: auto)
  - REQ-032.4: `WEB-42` has 200 comments → all 200 are on the page. (Verify: auto)
- **REQ-033** When the author edits their own comment, the system shall save the change with the same limits as REQ-031 and mark it "(edited)", with the edit time on hover. Nobody else, including admins, can edit it.
  - REQ-033.1: Sam fixes a typo in their comment → the comment shows "(edited)". (Verify: auto)
  - REQ-033.2: An admin views Sam's comment → no Edit option (STD-2). (Verify: auto)
  - REQ-033.3: Sam saves an edit just after an admin deleted that comment → the toast "This comment was deleted" (STD-9), and Sam's text stays in the box. (Verify: auto)
- **REQ-034** When the author, or an admin, deletes a comment, the system shall ask for confirmation, then remove it permanently from the thread, leaving no trace.
  - REQ-034.1: Sam deletes their own comment and confirms → it's gone for everyone. (Verify: auto)
  - REQ-034.2: An admin deletes Alex's comment → it's gone. (Verify: auto)
  - REQ-034.3: Alex, a member, views Sam's comment → no Delete option (STD-2). (Verify: auto)
  - REQ-034.4: Sam is deactivated → Sam's comments show "Sam Lee (deactivated)", and an admin can still delete them. (Verify: auto)
- **REQ-035** If a member tries to leave a page while the comment box holds unsent text, the system shall ask "You have an unsent comment. Leave anyway?" before leaving. If an issue or project description editor holds unsaved changes, it shall ask "You have unsaved changes. Leave anyway?". Closing the tab or reloading shows the browser's own prompt instead.
  - REQ-035.1: Sam types a comment on `WEB-42`, then clicks another project → the prompt appears; Cancel keeps Sam on `WEB-42` with the text intact. (Verify: auto)
  - REQ-035.2: The comment box is empty → Sam leaves with no prompt. (Verify: auto)
  - REQ-035.3: Sam edits the `WEB` project description without saving, then clicks My issues → "You have unsaved changes. Leave anyway?". (Verify: auto)
  - REQ-035.4: Sam edits `WEB-42`'s description without saving, then closes the tab → the browser asks before closing. (Verify: manual)

**Exceptions to standard behaviors:** None.
**Uses:** Comment, Issue, Project, Member · DEC-001 (Markdown) · DATA-001 (mentions) · SEC-002 (safe Markdown) · REQ-007, REQ-013

### F-007 My issues

**Release:** R1 · **Priority:** Should

**What and why:** My issues shows every issue assigned to the signed-in member across all active projects, so each person sees their own work in one place. It's the page members land on after signing in.

**Flow**

1. A member signs in, or clicks **My issues** in the sidebar.
2. The system shows every issue assigned to them in active projects, grouped by status.
3. The member clicks an issue to open it.

**Rules and examples**

- **REQ-041** When a member opens My issues, the system shall show all the issues assigned to them in active projects, on one page with no paging. They're grouped by status in the REQ-017 order, each group headed with its count, and empty groups are hidden. As on the board (REQ-028), Done and Canceled show only issues moved there in the last 14 days. The page always shows the signed-in member's own issues; there's no way to view someone else's.
  - REQ-041.1: Sam is assigned `API-7` (Backlog), `WEB-42` (In Progress) and `WEB-3` (In Progress) → groups Backlog (1) and In Progress (2). (Verify: auto)
  - REQ-041.2: Sam's `WEB-10` was moved to Done 20 days ago → not shown. (Verify: auto)
  - REQ-041.3: Project `API` is archived → `API-7` isn't shown (REQ-013). (Verify: auto)
  - REQ-041.4: Nothing is assigned to Sam → "Nothing assigned to you" (STD-7). (Verify: auto)
  - REQ-041.5: Sam is assigned 300 open issues → all 300 are on the page, grouped. (Verify: auto)
  - REQ-041.6: Alex reassigns `WEB-42` to themselves while Sam has the page open → `WEB-42` stays listed until Sam reloads; opening it shows Alex as assignee. (Verify: manual)
- **REQ-042** Each row shall show the issue ID, title, project name, priority, labels and last updated. A title or project name too long for one line is cut off with "…" and shown in full on hover. Within a group, rows are sorted by priority from Urgent down, then by most recently updated. There's no filtering, search or manual ordering on this page in R1.
  - REQ-042.1: In Progress holds `WEB-3` (Low) and `API-9` (Urgent) → `API-9` comes first. (Verify: auto)
  - REQ-042.2: Sam clicks `WEB-42` → the issue opens. (Verify: auto)
  - REQ-042.3: A 200-character title → one line ending in "…"; hovering shows the full title. (Verify: manual)

**Exceptions to standard behaviors:** None.
**Uses:** Issue, Project, Member · REQ-013, REQ-017, REQ-028 · STD-7 · NFR-002

### F-008 Email notifications

**Release:** R1 · **Priority:** Should

**What and why:** Members get an email when they're assigned an issue or @mentioned, so they don't miss work that needs them while the app is closed. Email is the only notification channel in R1, and there are no settings for it.

**Flow**

1. A member assigns an issue to a teammate, or @mentions a teammate in an issue description, a project description or a comment.
2. The system emails that teammate, saying who did what and linking to the issue or project.
3. The teammate clicks the link and lands on the issue or project, signing in first if needed (STD-1).

**Rules and examples**

- **REQ-043** When a member assigns an issue to someone other than themselves, the system shall email the new assignee. The subject is "[WEB-42] Fix login button: assigned to you by Alex Kim", and the body gives the project name and a link to the issue. The previous assignee gets nothing.
  - REQ-043.1: Alex assigns `WEB-42` to Sam → Sam gets the email. (Verify: auto)
  - REQ-043.2: Sam assigns `WEB-42` to themselves → no email. (Verify: auto)
  - REQ-043.3: Alex reassigns `WEB-42` from Sam to Jo → Jo gets the email; Sam gets nothing. (Verify: auto)
- **REQ-044** When a mention (DATA-001) is saved in an issue description, a project description or a comment, the system shall email each mentioned member other than the author. The subject is "[WEB-42] Fix login button: Alex Kim mentioned you", or "[WEB] Website: Alex Kim mentioned you" for a project, and the body holds the first 500 characters of the comment or description as plain text, plus a link to it. When text is edited, only members who weren't mentioned in its previously saved version are emailed, so a mention that's removed and later added back emails again. A member mentioned several times in one text gets one email.
  - REQ-044.1: Alex comments "@sam can you check?" on `WEB-42` → Sam gets the email, with that text and a link to the comment. (Verify: auto)
  - REQ-044.2: Sam writes `@sam` in their own comment → no email. (Verify: auto)
  - REQ-044.3: Alex edits a comment that already mentions `@sam` and adds `@jo` → only Jo is emailed. (Verify: auto)
  - REQ-044.4: One comment mentions `@sam` twice → Sam gets one email. (Verify: auto)
  - REQ-044.5: Alex mentions `@sam` in a comment on project `WEB` → the email links to the `WEB` project details page. (Verify: auto)
- **REQ-045** The system shall send a notification 2 minutes after it's created. Further notifications for the same member about the same issue or project, created before that email goes out, join it in one email; they don't restart the wait. A notification is dropped if, within that time, the assignment is undone, the mention is edited out, the comment holding it is deleted, or the recipient is deactivated. A failed send is retried as in STD-6. A bounce reported by the email service is logged and not retried; the action in the app is unaffected. Notifications for issues or projects deleted during the wait are still sent.
  - REQ-045.1: Within 1 minute, Alex assigns `WEB-42` to Sam and mentions `@sam` in a comment on it → Sam gets one email covering both. (Verify: auto)
  - REQ-045.2: Alex assigns `WEB-42` to Sam, then reassigns it to Jo 30 seconds later → Sam gets nothing; Jo gets one email. (Verify: auto)
  - REQ-045.3: Alex mentions `@sam`, then edits the mention out within a minute → Sam gets nothing. (Verify: auto)
  - REQ-045.4: Alex deletes their comment mentioning `@sam` within a minute → Sam gets nothing. (Verify: auto)
  - REQ-045.5: Sam is deactivated during the wait → Sam's email isn't sent. (Verify: auto)
  - REQ-045.6: The email service reports that Sam's mailbox doesn't exist → the bounce is logged; nothing is resent. (Verify: auto)
  - REQ-045.7: Alex assigns `WEB-42` to Sam, and `WEB-42` is deleted a minute later → Sam still gets the email, and its link shows Not found (STD-4). (Verify: auto)
  - REQ-045.8: Alex mentions `@sam` on `WEB-42` at 10:00 and again at 10:01:30, then at 10:02:30 → one email at about 10:02 covers the first two; the third goes in a new email at about 10:04:30. (Verify: auto)

**Exceptions to standard behaviors:** None.
**Uses:** Notification, Issue, Project, Comment, Member · DATA-001 (mentions) · STD-6 · REQ-007 · API-002, API-003

## System

### 6. Standard behaviors

| ID | Situation | What happens |
|---|---|---|
| STD-1 | Not signed in | The page redirects to sign-in, then returns to the page the member asked for once they've signed in, as long as it's a page in this app (SEC-009). API: `401`. |
| STD-2 | Not allowed | Actions the member can't take are hidden. If reached anyway, the message is "You don't have permission to do that." API: `403`. |
| STD-3 | Invalid input | The error shows next to the field, the form keeps everything typed, and nothing is saved. API: `422` with an error per field. |
| STD-4 | Item not found | A "Not found" page with a link to My issues. This also covers a project key or issue ID that doesn't exist, such as `WEB-999`. API: `404`. |
| STD-5 | Same action sent twice | The submit button is disabled while saving. Creating an issue or comment carries a request ID, so a retry or double-click never creates two. |
| STD-6 | A service we depend on fails | The only outside service is email. If an invitation or password reset email fails, nothing is saved and the person sees "We couldn't send the email. Try again." If a notification email fails, the app retries 3 times over about 15 minutes, then logs the failure; the action that caused it still succeeds. |
| STD-7 | Every screen | A loading indicator shows if loading takes more than 300 ms. Empty states name the next action ("No issues yet. Create one."). An error state shows "Couldn't load this." beside a Retry button (DEC-006). Speed targets are in section 11. |
| STD-8 | Two members edit the same thing | Single fields such as status, assignee, priority and labels: the last save wins. Descriptions: if someone else saved since you opened the editor, nothing is saved. You see "This was changed by [name]. Copy your text and reload.", and your text stays in the editor. |
| STD-9 | A form submission fails | A toast error appears, disappears after 5 seconds with no dismiss or pause control, and the form keeps everything typed (DEC-006). This covers failures not tied to one field, such as a network error, a server error, a `403` (STD-2) or a failed invitation or password reset email (STD-6). Validation errors stay next to their fields (STD-3), and the STD-8 conflict message stays in the editor. For a network error or a server error, the toast reads "Couldn't save. Try again." |

**STD-9 examples**
  - STD-9.1: Sam's save fails → one error toast shows, and 5 seconds later it's gone; it has no dismiss or pause control. (Verify: auto)
  - STD-9.2: A second save fails while the first toast is showing → the new message replaces it, and the 5 seconds start again. (Verify: auto)
  - STD-9.3: Sam's save fails with a network error or a server error → the toast reads "Couldn't save. Try again."; any other failure shows the server's message. (Verify: auto)

### 7. Roles and permissions

| Action | Admin | Member |
|---|---|---|
| See all projects, issues and comments | Yes | Yes |
| Edit own profile | Yes | Yes |
| Change own password | Yes | Yes |
| Open the members page (REQ-051) | Yes | No |
| Invite, resend or revoke an invitation | Yes | No |
| Deactivate or reactivate a member | Yes | No |
| Make a member an admin, or remove admin | Yes (the last admin can't be removed) | No |
| Create a project, or edit its name | Yes | No |
| Edit a project description | Yes | Yes |
| Change a project key | No | No |
| Archive, unarchive or delete a project | Yes | No |
| Create and edit issues (status, assignee, priority, labels) | Yes | Yes |
| Delete an issue | Yes | Only issues they created |
| Create, rename, recolor or delete labels | Yes | Yes |
| Comment | Yes | Yes |
| Edit a comment | Own only | Own only |
| Delete a comment | Any | Own only |

There are no private projects. Nobody, including admins, can see or set another member's password. The first admin is created by the setup command (OPS-001).

### 8. Data

| Entity | What it holds | Notes |
|---|---|---|
| Member | Email, full name, username, password hash, role (Admin or Member), active or deactivated, created at | Created by accepting an invitation (REQ-002) or by the setup command (OPS-001). Email and username are unique, ignoring capitals. Never deleted, only deactivated. |
| Invitation | Email, invited by, secret token, expires at, state (Pending, Accepted, Revoked, Expired, Bounced) | Expires 7 days after sending (REQ-001). At most one pending invitation per email. |
| Password reset link | Member, secret token, expires at, used at | Expires 30 minutes after sending (REQ-050). |
| Session | Member, secret token, last active at | Ends 30 days after last activity (REQ-006). |
| Project | Name, key, Markdown description, archived at, next issue number, created at | The key is unique forever, including deleted projects (REQ-009). |
| Label | Project, name, color | Name unique within its project, ignoring capitals. One of 8 preset colors (REQ-021). |
| Issue | Project, number, title, Markdown description, status, priority, assignee, labels (0 to 10), board position, created by, created at, last updated, status changed at | Number unique within its project and never reused (REQ-016). Board position is per status column (REQ-027). "Status changed at" drives the 14-day window (REQ-028). |
| Comment | Either an issue or a project, author, Markdown body, created at, edited at | Belongs to exactly one issue or one project. |
| Mention | The text it's in (an issue description, a project description or a comment), the member mentioned | Lets an edit email only new mentions (REQ-044). |
| Notification | Recipient, kind (Assigned or Mentioned), issue or project, who caused it, the issue ID or project key, its title or name, the text excerpt (up to 500 characters), send after, state (Pending, Sent, Dropped, Failed, Bounced) | "Send after" is 2 minutes after the recipient's first pending notification about that issue or project (REQ-045). The ID, title and excerpt are saved when it's created, and later edits don't change them (section 9, Email content). Not deleted with its issue or project (REQ-045). |
| Sign-in attempt | Email, IP address, attempted at | Records failed sign-ins and wrong current passwords (REQ-049) for SEC-001. |
| Password reset request | Email, IP address, requested at | Records reset requests for SEC-001. |

- **DATA-001** When a member types `@` in an issue description, a project description or a comment, the system shall suggest active members. A saved `@username` outside code that matches an active member becomes a mention, shown highlighted (not a link, since there are no member pages) with the member's full name on hover, and triggers F-008.
  - DATA-001.1: Description contains `@sam` → shown highlighted, with "Sam Lee" on hover; Sam is mentioned. (Verify: auto)
  - DATA-001.2: `@nobody` (no such member) → shown as plain text; no mention. (Verify: auto)
  - DATA-001.3: `@jo`, where Jo is deactivated → plain text; no mention (REQ-007). (Verify: auto)
  - DATA-001.4: `@sam` inside inline code or a code block → shown as code; no mention. (Verify: auto)
  - DATA-001.5: `sam@acme.com` or `foo@sam` → plain text; no mention. (Verify: auto)
  - DATA-001.6: `(@sam)` and `@sam, thanks` → both mention Sam. (Verify: auto)
- **DATA-002** When a project or issue is deleted, the system shall delete everything that belongs to it: a project takes its issues, labels, comments and mentions with it, and an issue takes its comments and mentions with it. Notifications are kept, so pending ones are still sent (REQ-045). A deleted project's key stays reserved (REQ-009).
  - DATA-002.1: `WEB` is deleted, with 120 issues, 8 labels and 300 comments → all of them are gone from the database, and a new project can't use the key `WEB`. (Verify: auto)
- **DATA-003** The system shall store all times in UTC and show them in each member's browser time zone.
  - DATA-003.1: A comment saved at 02:00 UTC → a member whose browser is on UTC+7 sees 09:00. (Verify: auto)
- **DATA-004** The system shall delete, 30 days after they stop being useful: invitations that are accepted or revoked, or have passed their expiry; password reset links that are used or expired; sessions that have ended; notifications that are sent, dropped, failed or bounced; sign-in attempts, which stop being useful an hour after they're made; and password reset requests, which stop being useful a day after they're made.
  - DATA-004.1: A password reset link expired 31 days ago → it's no longer in the database. (Verify: auto)
  - DATA-004.2: A notification was sent 10 days ago → still stored. (Verify: auto)

### 9. Interfaces and integrations

| ID | Call or system | Used for |
|---|---|---|
| API-001 | The app's own HTTP API, under `/api/…`, used only by its own web front end | Every feature. It isn't public or documented for outside use. Errors follow STD-1 to STD-4 (`401`, `403`, `422`, `404`). The exact list of endpoints is the agent's choice (DEC-002). |
| API-002 | Outgoing email service (a transactional email provider, DEC-003) | Invitations (REQ-001), password reset links (REQ-050) and notifications (F-008). If it fails, see STD-6: a password reset request shows "We couldn't send the email", and notifications are retried 3 times. |
| API-003 | `POST /webhooks/email` (bounce reports from the email service) | Marking notifications as Bounced (REQ-045.6). It accepts only requests signed by the email service; anything else gets `401`. |
| API-004 | Page addresses: `/sign-in`, `/forgot-password`, `/reset-password?token=…`, `/invite?token=…`, `/my-issues`, `/project/{KEY}` (board), `/project/{KEY}/list`, `/project/{KEY}/detail`, `/project/{KEY}/labels`, `/project/{KEY}/settings`, `/projects/archived`, `/issue/{ID}`, `/settings/profile`, `/settings/members` | Links in emails and between members. Keys and IDs are matched ignoring capitals (REQ-016.5). The list view's filters go in the query string (REQ-040). |

**Email content (API-002)**

All emails are plain text. `{…}` are filled in when the email is sent, `{APP_URL}` is the app's address, links are full addresses, and every body ends with a blank line and `— Tracklite`.

**Invitation** (REQ-001)
- Subject: `{Inviter name} invited you to Tracklite`
- Body:
  ```
  {Inviter name} invited you to join their team on Tracklite.

  Accept the invitation: {APP_URL}/invite?token={token}

  This link works once and expires in 7 days. If you weren't expecting this, you can ignore this email.
  ```

**Password reset** (REQ-050)
- Subject: `Reset your Tracklite password`
- Body:
  ```
  Someone asked to reset the password for {email} on Tracklite.

  Choose a new password: {APP_URL}/reset-password?token={token}

  This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password hasn't changed.
  ```

**Notification, one item** (REQ-043, REQ-044)

| Kind | Subject | Body |
|---|---|---|
| Assigned | `[WEB-42] Fix login button: assigned to you by Alex Kim` | `Alex Kim assigned WEB-42 to you in Website.` + blank line + link to the issue |
| Mentioned in a description | `[WEB-42] Fix login button: Alex Kim mentioned you` | `Alex Kim mentioned you in the description of WEB-42 (Website):` + blank line + excerpt + blank line + link to the issue |
| Mentioned in an issue comment | same as above | `…in a comment on WEB-42 (Website):` + excerpt + link to `/issue/WEB-42#comment-{id}` |
| Mentioned in a project comment | `[WEB] Website: Alex Kim mentioned you` | `…in a comment on project Website:` + excerpt + link to `/project/WEB/detail#comment-{id}` (REQ-044.5) |

**Notification, combined** (REQ-045, several items in one email)
- Subject: `[WEB-42] Fix login button: {n} updates for you`. Or `[WEB] Website: {n} updates for you` for a project.
- Body: each item's body from the table above, oldest first, separated by a line holding `---`.
- The subject uses the issue title and project name from the **newest** item, so a title renamed during the wait shows its latest version.

**The excerpt** (REQ-044): the text with Markdown formatting stripped and whitespace collapsed, cut at 500 characters, with `…` added if it was cut. It's taken when the notification is created, so later edits don't change it.

### 10. Security and privacy

- **SEC-001** The system shall allow, per hour, at most 10 failed sign-in attempts per email address and 30 per IP address, and at most 5 password reset requests per email address and 20 per IP address. Past a limit, it shows the inline message "Too many attempts. Try again later.", doesn't sign anyone in even with the right password, and sends nothing, whether or not the email belongs to a member. Wrong current passwords on the profile (REQ-049) count as failed sign-in attempts. Each limit counts the last 60 minutes, and a successful sign-in doesn't reset the count.
  - SEC-001.1: Sam's password is entered wrongly 10 times within an hour, then correctly → the limit message is shown, and Sam isn't signed in. (Verify: auto)
  - SEC-001.2: Sam requests a 6th reset link within an hour → the limit message is shown, and no email is sent. (Verify: auto)
  - SEC-001.3: `stranger@x.com` is tried 11 times, or requested for a reset 6 times → the same limit message, so nobody can tell whether the email exists. (Verify: auto)
- **SEC-002** When showing Markdown, the system shall show raw HTML as text and never run scripts. Links may only use `http`, `https` or `mailto`, and open in a new tab without access to the app's page.
  - SEC-002.1: `<img src=x onerror=alert(1)>` → shown as text; nothing runs. (Verify: auto)
  - SEC-002.2: `[click](javascript:alert(1))` → shown as plain text, not a link. (Verify: auto)
- **SEC-003** The system shall create invitation, password reset and session tokens from at least 128 random bits, and store only a hash of each.
  - SEC-003.1: Someone reads the database → none of the stored values works as a link or session, and none reveals a password (SEC-008). (Verify: auto)
- **SEC-004** The system shall keep the session in a cookie that page scripts can't read, that's sent only over HTTPS outside local development (local development is any run whose `NODE_ENV` isn't `production`), and that's sent on top-level link clicks from other sites but never on cross-site form posts or background requests. It shall reject requests that change data if they come from another site.
  - SEC-004.1: A page on another site submits a form to delete `WEB-42` → rejected with `403`; nothing changes. (Verify: auto)
- **SEC-005** The system shall serve everything over HTTPS, redirecting plain HTTP to HTTPS and telling browsers to use HTTPS only.
  - SEC-005.1: A member opens `http://…/my-issues` → redirected to `https://…/my-issues`. (Verify: ops)
- **SEC-006** The system shall check permissions on the server for every request, not only by hiding buttons (STD-2, section 7).
  - SEC-006.1: A member sends the API request that deletes project `WEB` → `403`; nothing changes. (Verify: auto)
- **SEC-007** The system shall never write passwords, tokens, invitation or password reset links, or the text of descriptions and comments into logs. This includes the web server's and reverse proxy's access logs, which leave out the query string of `/invite` and `/reset-password`.
  - SEC-007.1: Sam signs in → the log records "sign-in, member sam", with no password or token. (Verify: auto)
  - SEC-007.2: Sam opens a password reset link → the access log shows `/reset-password` with no token. (Verify: ops)
- **SEC-008** The system shall store each password only as a salted hash from a slow, memory-hard algorithm: Argon2id with at least 19 MiB of memory, 2 iterations and a parallelism of 1 (the OWASP baseline). A password is never logged, emailed, returned by the API or put in a URL. Password fields hide what's typed and work with password managers.
  - SEC-008.1: Sam and Alex choose the same password → their stored hashes differ, and neither contains the password. (Verify: auto)
  - SEC-008.2: Any API response about a member → no password or password hash in it. (Verify: auto)
- **SEC-009** After sign-in, the system shall return the member only to a page in this app. Any other return target, such as another site's address, sends them to My issues.
  - SEC-009.1: A sign-in link whose return target is `https://evil.example` or `//evil.example` → after signing in, Sam lands on My issues. (Verify: auto)
- **SEC-010** Every page shall be sent with headers that let only the app's own scripts run (a Content Security Policy), stop other sites from showing the app in a frame, and send no referrer to other sites.
  - SEC-010.1: Any page response → includes those three headers. (Verify: auto)
  - SEC-010.2: Another site puts `/my-issues` in a frame → the browser refuses to show it. (Verify: manual)

**Privacy notes**

- The personal data stored is limited to members' names and work emails.
- Notification emails include up to 500 characters of comment or description text (REQ-044), so the email provider sees that text.
- There's no encryption at rest beyond what the host provides.

**Accepted limitations**

These are accepted for a small invite-only team. The sign-in and password reset pages' messages stay the same for members and non-members (REQ-047.3, REQ-050.2, SEC-001.3).

- The time to answer a sign-in or password reset request may differ between member and non-member emails, so it can hint at which emails are members. No minimum response time is required.
- During an email-service outage, only a member's email gets "We couldn't send the email. Try again." (STD-6), so that message can reveal which emails are members.
- Someone who knows a member's email can block that member's sign-in for up to an hour by using up SEC-001's per-email limit with wrong passwords. The member waits, or an admin investigates; there's no permanent lockout.
- SEC-001's per-IP limit uses the rightmost `X-Forwarded-For` entry. Until the app runs behind a reverse proxy that appends or overwrites that header, a client can set the value; nothing is publicly deployed before then.
- Each password check uses about 19 MiB of memory (SEC-008), and SEC-001 only limits failures per hour, so a burst of sign-in requests at once can strain the small VPS.

### 11. Quality targets

| ID | Target | How measured |
|---|---|---|
| NFR-001 | Test data size: all other targets must hold with 50 projects, 10,000 issues and 50,000 comments. | A seed script that creates this data (the agent writes it) |
| NFR-002 | Every page is usable within 1.5 s of navigation, on broadband with a warm cache. The board holds this with 300 cards in one column, and My issues with 300 assigned issues. | Browser performance panel, on the NFR-001 data |
| NFR-003 | API reads answer in under 300 ms and writes in under 500 ms, for 95% of requests. | Server request timing logs |
| NFR-004 | List-view search and filters update within 500 ms of the 300 ms typing pause (REQ-038). | Browser performance panel, on the NFR-001 data |
| NFR-005 | A dropped card shows in its new place within 100 ms, before the save finishes; REQ-026 rolls it back if the save fails. | Manual check |
| NFR-006 | Browsers: the latest two versions of desktop Chrome, Firefox, Safari and Edge. Phones work but aren't polished (section 3). | Manual check in each browser |
| NFR-007 | Accessibility: every action can be done by keyboard (REQ-030 for the board), focus is always visible, and text contrast meets WCAG 2.2 AA. | Manual keyboard pass; an automated contrast checker such as axe |
| NFR-008 | 95% of password reset emails arrive within 1 minute. | Email provider's delivery logs |
| NFR-009 | Running cost, including hosting, email and domain, stays under $20 per month for the team. | Monthly bills |

There's no uptime target: one server has no redundancy (section 3). Section 13 covers backups instead.

### 12. Stack and constraints

- **Stack:** Next.js (TypeScript), PostgreSQL via Drizzle ORM (its query builder, with raw SQL only where the builder can't express a query), all on a single VPS. The front end is a single-page app: Next.js serves one HTML shell for every page address, and routing, page transitions and data fetching all happen in the browser, using React Router and Redux Toolkit (RTK Query for server data). Email goes through a transactional email service (API-002). Automated tests are unit and component tests only, using Vitest with React Testing Library on jsdom, run through npm scripts; there are no browser end-to-end tests (DEC-005). Lint uses Biome. UI uses the Track Lite design system (React components styled by its own CSS classes and design tokens), with React Aria Components for complex interactive widgets.
- **Commands:** build, test and lint commands live in the npm scripts in `package.json`. AGENTS.md tells agents to use them and doesn't copy them.
- **Boundaries:**
  - This spec is the source of truth for product behavior.
  - Permission checks live in one server-side layer used by every read and write (SEC-006).
  - Each user action is saved in one database transaction together with any notification records it creates. Emails are sent afterwards by a background job, which also handles the 2-minute wait (REQ-045).
  - Issues, project descriptions and comments carry a version number, used to detect stale saves (STD-8).
  - Markdown is rendered by one shared, sanitising renderer (SEC-002) and nowhere else.
  - There are no real-time updates; pages show current data when they load.
  - There are two environments: local development and the production VPS. No feature flags.
- **Agent's choices:**
  - DEC-002 (API endpoints): JSON over HTTPS, resource-style paths such as `/api/issues/WEB-42`, the STD-1 to STD-4 status codes (signing in, `POST /api/sessions` with email and password, may also answer `429` when a SEC-001 limit is reached; requesting a password reset link may answer `429`, and `503` when the email couldn't be sent, STD-6; sending or resending an invitation may also answer `503`), and a request ID on creates (STD-5). Every endpoint needs a session except sign-in, sign-out (which succeeds with or without a session), requesting and using a password reset link, invitation acceptance and the webhook (API-003). Requesting a password reset link and sending or resending an invitation are exempt from NFR-003's 500 ms write limit, because they include the call to the email service and STD-6 needs the send result before answering.
  - DEC-003 (email provider): it must have an HTTP API and bounce webhooks (API-003), fit within NFR-009's budget, send from the team's domain with SPF and DKIM, and keep its API key only in server config (OPS-006). If no provider fits, stop and ask.
  - DEC-004 (background jobs): run on the same VPS with no paid queue service, and survive a restart without losing pending notifications.

### 13. Release and operations

- **OPS-001** The system shall provide a setup command that creates the first admin from an email, full name, username and password, only when no members exist. The command asks for the password twice without showing it (REQ-048) and never takes it as an argument, so it doesn't end up in shell history.
  - OPS-001.1: Run on a fresh install → admin created, who can then sign in with that email and password. (Verify: ops)
  - OPS-001.2: Run when members already exist → refuses with "Setup already done", nothing changed. (Verify: ops)
- **OPS-002** A deploy shall be one command run from `main`. It runs the database migrations first and switches to the new version only if they succeed.
  - OPS-002.1: The migrations succeed → the new version serves traffic, with no manual steps. (Verify: ops)
  - OPS-002.2: A migration fails → the old version keeps running unchanged, and the command reports the error. (Verify: ops)
- **OPS-003** The system shall back up the database daily at 03:00 UTC to storage off the VPS, keeping 14 daily backups. Backups are encrypted before they leave the VPS, and the storage fits within NFR-009. If a backup fails, the owner is emailed. A restore is tested once before launch.
  - OPS-003.1: The VPS disk is lost → the data is restored from the most recent backup, losing at most one day. (Verify: ops)
  - OPS-003.2: The 15th backup is taken → the oldest is deleted. (Verify: ops)
  - OPS-003.3: The 03:00 backup fails → the owner gets an email about it. (Verify: ops)
- **OPS-004** The previous release shall stay on the server, so one command switches back to it. Each release's migrations must also work with the previous release's code.
  - OPS-004.1: A deploy causes errors → the rollback command restores the previous version within 2 minutes, with no database restore needed. (Verify: ops)
- **OPS-005** An external uptime check shall call `/health` every 5 minutes and email the owner when it fails twice in a row. `/health` answers `200` only when the database responds.
  - OPS-005.1: The database stops → `/health` returns `503`, and the owner is emailed within about 10 minutes. (Verify: ops)
- **OPS-006** Secrets, such as the email API key and the database password, shall live in a config file on the server, never in the repository. Logs are rotated and kept for 14 days.
  - OPS-006.1: A search of the repository for the email API key → no match. (Verify: auto)

## Appendix: Decisions and changes

**Resolved decisions**

| ID | Decision | Why |
|---|---|---|
| DEC-001 | R1 descriptions and comments use GitHub-flavoured Markdown (tables, task lists, strikethrough and autolinks), shown formatted. Task-list checkboxes are shown but can't be ticked in the formatted view; members edit the text instead. | It's normal for the team and gives a clean path to rich text (F-010). |
| DEC-005 | Test tools: Vitest with React Testing Library on jsdom, run through npm scripts, for all `Verify: auto` examples. Server tests run against a real test PostgreSQL database. There are no browser end-to-end tests; shared screen states are checked by component tests. | The owner chose one fast test setup with no browser end-to-end tool. |
| DEC-006 | Generic error copy: a network or server error toast reads "Couldn't save. Try again." (STD-9), and an error state reads "Couldn't load this." beside Retry (STD-7). The STD-9 toast keeps its fixed 5 seconds with no dismiss or pause control. | The owner chose short, plain copy, and kept the fixed toast timing deliberately despite WCAG 2.2 timing guidance. |

**Changelog**

- **0.20 (2026-10-05):** REQ-023 names the delete confirmation's copy.
- **0.19 (2026-10-05):** REQ-019 names the field error for assigning someone who isn't an active member.
- **0.18 (2026-10-05):** REQ-016 names the field error for a title over 200 characters.
- **0.17 (2026-10-05):** REQ-013: an archived project's name is read-only too (new REQ-013.7).
- **0.16 (2026-10-05):** REQ-021 names the field errors for a missing or too-long label name and an unknown color.
- **0.15 (2026-10-05):** REQ-009 names the field errors for a missing or too-long project name, and REQ-010 the field error for a request that changes a project key.
- **0.14 (2026-10-05):** REQ-051: a deactivated member's only action on the members page is reactivate; role changes wait until they're reactivated.
- **0.13 (2026-10-05):** REQ-001 names the field error for an invalid email address.
- **0.12 (2026-10-04):** REQ-003 names the field error for an invalid username.
- **0.11 (2026-10-04):** STD-9 gets numbered examples (STD-9.1 to STD-9.3) so its toast behaviour can be tested.
- **0.10 (2026-10-03):** UI stack in section 12: the Track Lite design system replaces the Hairline Design System. React Aria Components stay for complex interactive widgets; Tailwind CSS is no longer named.
- **0.9 (2026-10-03):** Review fixes before build, plus the technical-design pass.
  - **From the technical-design pass:** Section 12 names Drizzle ORM instead of postgres.js, reversing the 0.7 change. Reordering a card within its column doesn't change "last updated" (REQ-036, new REQ-036.5). The notification wait is fixed from the first notification, not restarted by later ones (REQ-045, new REQ-045.8). A failed invitation email saves nothing and shows "We couldn't send the email. Try again." (REQ-001, new REQ-001.7, STD-6, STD-9). Mentions are shown highlighted with the full name on hover, not as links (DATA-001, DATA-001.1, REQ-031.1). The wording of every email is defined (section 9, Email content). API-004 lists the invitation, project settings, archived projects and profile pages. Copy added for a password change (REQ-049), the deactivate confirmation (REQ-007) and an empty Archived list (REQ-013). The front end is a single-page app with React Router and Redux Toolkit (section 12).
  - **Contradictions resolved:**
    - Pending notifications survive deletion of their issue or project, including mentions in comments deleted along with it. They carry their own saved title and excerpt (REQ-045, DATA-002, section 8).
    - Deactivation stops outstanding password reset links (REQ-007, REQ-007.5, REQ-050).
    - Section 12 names Drizzle ORM on postgres.js, matching the code. Server tests against a real test database are allowed (DEC-005).
    - DATA-004 uses section 8's entity names and also deletes failed notifications. Sign-in attempts and password reset requests are added to section 8.
  - **New:**
    - Members page (REQ-051) and admin role changes, with the last-admin rule safe against simultaneous changes (REQ-052).
    - Inviting an email with a pending invitation resends it. Invitation email failures and bounces are handled (REQ-001.7 to REQ-001.9, STD-6, API-003).
    - Mentions work in project descriptions (REQ-012, REQ-044.6), and DATA-001 defines where a mention starts and ends.
    - REQ-045 fixes the 2-minute wait from the first notification and defines the combined email's subject. A re-added mention emails again (REQ-044.7).
    - Unsaved description edits prompt before leaving (REQ-035).
  - **Routes:** invitation, profile, project settings and Archived projects pages, and comment links (API-004).
  - **Labels:** the 8 colors are named, the picker reuses existing names, labels it creates are Gray, and deleting asks for confirmation (REQ-020, REQ-021).
  - **"Last updated":** defined (REQ-036).
  - **Security:**
    - Return after sign-in is limited to this app (new SEC-009).
    - Security headers (new SEC-010).
    - Tokens are kept out of access logs (SEC-007).
    - Argon2id settings (SEC-008).
    - Wrong current passwords count toward SEC-001.
  - **Backups:** encrypted, with failure emails (OPS-003).
  - **Out of scope:** activity history, cross-project search, changing email and data export (section 3).
  - **Smaller fixes:**
    - Trimming for project and label names.
    - Years on old comment dates (REQ-031).
    - The Markdown flavour (DEC-001).
    - STD-8 when the other editor was you.
    - Unknown or malformed reset links (REQ-050.9).
- **0.8 (2026-10-03):** Sign-in moves from magic links to email and password. Members choose a password when accepting an invitation (REQ-002) and sign in with email and password (new REQ-047). Passwords are 12 to 128 characters with no character-type rules (new REQ-048), can be changed from the profile (new REQ-049, REQ-003.3), and are reset through an emailed link valid for 30 minutes (new REQ-050). REQ-004 and REQ-005 are superseded. SEC-001 limits failed sign-ins and reset requests; passwords are stored as Argon2id hashes and never logged (new SEC-008, SEC-007). The Magic link entity becomes Password reset link (section 8, DATA-004). Two-factor authentication, passkeys and outside identity providers are out of scope (section 3). The setup command asks for the first admin's password (OPS-001). Updated to match: glossary, REQ-007.1, REQ-008.1, STD-6, STD-9, section 7, API-002, API-004, NFR-008, DEC-002 and the accepted limitations.
- **0.7 (2026-10-01):** Sign-in details settled while specifying magic-link sign-in. A signed-in member opening someone else's invitation or magic link is asked to sign out, with their full name shown (REQ-002.3, new REQ-005.5). Full names are trimmed, can't be blank and are refused with "Too long (max 60)" past 60 characters, and initials are defined (REQ-003, new REQ-003.4). The magic-link page address is listed (API-004). The SEC-001 limit message shows inline. The session cookie is sent on top-level link clicks from other sites but never on cross-site form posts or background requests, and its HTTPS-only rule applies outside local development (`NODE_ENV` other than `production`) (SEC-004). Section 12 names postgres.js instead of Drizzle ORM. Requesting a sign-in link may answer `429` and `503`, sign-out works with or without a session (DEC-002), and requesting a sign-in link is exempt from NFR-003's write limit. DATA-004 also deletes sign-in limit records and sign-in request records. Accepted limitations recorded in section 10.
- **0.6 (2026-10-01):** UI stack named in section 12: Hairline Design System on Tailwind CSS v4 and React Aria Components.
- **0.5 (2026-10-01):** Lint tool named in section 12: Biome.
- **0.4 (2026-09-29):** Test tools decided: Vitest with React Testing Library on jsdom, and no browser end-to-end tests (DEC-005; section 12 updated).
- **0.3 (2026-09-29):** Exact copy for a network or server error toast (STD-9) and for the error state (STD-7), and the STD-9 toast timing confirmed with no dismiss or pause control (DEC-006).
- **0.2 (2026-09-29):** A project's description and comments move to its project details page, `/project/{KEY}/detail` (REQ-046; REQ-032, REQ-044.5 and API-004 updated). Archiving a project also freezes its labels (REQ-013, REQ-013.5, REQ-013.6). Usernames can't be changed (REQ-003, REQ-003.3).

**Superseded items**

- **REQ-004** (requesting a magic link by email, 15-minute single-use link) and its examples REQ-004.1 to REQ-004.3: superseded in 0.8 by REQ-047 (password sign-in) and REQ-050 (password reset link).
- **REQ-005** (the magic-link landing page and Sign in button) and its examples REQ-005.1 to REQ-005.5: superseded in 0.8 by REQ-047 and REQ-050.
- **Magic link** (glossary term and section 8 entity): superseded in 0.8 by Password reset link.
