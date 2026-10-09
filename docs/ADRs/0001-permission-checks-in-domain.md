# ADR 0001: Permission checks live in domain functions

- **Status:** Accepted
- **Date:** 2026-10-08
- **Supersedes:** the role check in `apiRoute` (tech-design §1.2 step 4, `apiRoute("admin", …)`)

## Context

Reading a domain file doesn't show who may call its functions. In `src/server/projects.ts`:

- `updateProject` calls `requireAdmin(member)` for renames and archiving.
- `createProject` and `deleteProject` check nothing. Their admin check is `apiRoute("admin", …)` in the route files.

Someone reading only `projects.ts` would conclude that any member can create or delete a project. The two `require*` functions in `sessions.ts` also differ in shape, which adds to the confusion:

| | `requireMember` | `requireAdmin` |
|---|---|---|
| Takes | `Request` | `Member` |
| Returns | `{ member, cookie? }` | nothing |
| Error | 401 | 403 |

## Decision

1. **The route says who you are; the domain says what you may do.**
   - `apiRoute` only authenticates. `requireMember` stays at the route (401) and passes the loaded `Member` to the handler.
   - The `"admin"` access mode is removed, so `access` becomes `"public" | "member"`. Routes check no roles.
2. **`actor` comes first.** Every domain function called from a signed-in route takes the acting member as its first parameter, named `actor`. This includes reads such as `listProjects` and `getProject`, even where the function doesn't use it yet.
   - Out of scope: public flows (sign-in, password reset, invitation lookup and accept, the email webhook), the worker and cleanup, and helpers (log, tokens, email, limits).
3. **Admin checks.**
   - `sessions.ts` gets `type Admin = Member & { role: "admin" }` and `assertAdmin(member: Member): asserts member is Admin`. It throws `403` "You don't have permission to do that." (STD-2).
   - Admin-only functions take `actor: Member` and call `assertAdmin(actor)` as their first statement.
   - Mixed functions call `assertAdmin` on their admin-only branch. Example: `updateProject` for `name` and `archived`.
   - Ownership checks ("author or admin", "creator or admin") stay in the domain, as now.
   - `requireAdmin` is deleted. `requireMember` keeps its name and shape, and is now the only `require*`.
4. **Logging.** `apiRoute` adds the actor's username as `actor` on its one JSON log line per request. Domain functions don't log.
   - This is allowed under SEC-007, which forbids passwords, tokens, links and description or comment text. A username is none of those, and SEC-007.1 itself logs "member sam".
   - Public and signed-out requests have no `actor` key.
5. **Order of checks:**
   1. cross-site check (403);
   2. session (401);
   3. body schema (422);
   4. the domain's role check (403), before any lookup;
   5. lookups (404) and ownership checks (403), since ownership needs the row;
   6. database rules;
   7. the write.

## Consequences

- **Reading a domain file shows its permission rules.** SEC-006 ("permission checks live in one server-side layer", spec line 699) still holds: that layer is now the domain layer.
- **No typecheck enforcement.** An admin-only function that forgets `assertAdmin` still compiles. One 403 test per admin-only function, called directly on the domain function, is the guard.
  - Rejected alternative 1: typing admin-only functions as `actor: Admin`. Routes would then have to narrow the member first, which puts the role check back in the route.
  - Rejected alternative 2: an `adminOnly` wrapper. It would add an abstraction for a check that's one line.
- **A role check comes before any lookup**, so a member gets 403, not 404, for an admin-only action on a missing target.
- **A member's invalid body on an admin-only route still gets 422, not 403.** This isn't new: D-42 already validates before the role check. Only the step that does the role check moves.
- **Known gap: malformed JSON can give 500.** `PATCH /api/members/{username}` and `POST /api/invitations` still parse their bodies by hand. A member sending malformed JSON there now gets `500` instead of `403`, because the route's `request.json()` fails before the domain check runs. The browser never sends this. M12.2 gives invitations a schema; the members route needs one too.

## Implementation plan

### Admin-only call sites today

| Route | Domain function |
|---|---|
| `src/app/api/projects/route.ts` POST | `createProject(project)` |
| `src/app/api/projects/[key]/route.ts` DELETE | `deleteProject(key)` |
| `src/app/api/members/[username]/route.ts` PATCH | `updateMember(username, body)` |
| `src/app/api/invitations/route.ts` GET | `listInvitations()` |
| `src/app/api/invitations/route.ts` POST | `createInvitation(member, email)` |
| `src/app/api/invitations/[id]/route.ts` DELETE | `revokeInvitation(id)` |
| `src/app/api/invitations/[id]/resend/route.ts` POST | `resendInvitation(member, id)` |

There's also one role check inside a domain function, on a mixed route: `updateProject` calls `requireAdmin(member)`.

### Domain entry points that take `actor` first

**Admin-only.** First statement is `assertAdmin(actor)`:
- `projects.ts`: `createProject`, `deleteProject`
- `members.ts`: `updateMember`
- `invitations.ts`: `listInvitations`, `createInvitation`, `resendInvitation`, `revokeInvitation`

**Mixed:**
- `projects.ts`: `updateProject`. `assertAdmin` covers `name` and `archived`.
- `members.ts`: `listMembers`. It shapes the response by role and never throws.

**Ownership:**
- `comments.ts`: `editComment`, `deleteComment`
- `issues.ts`: `deleteIssue`

**Any member:**
- `projects.ts`: `listProjects`, `getProject`
- `labels.ts`: `listLabels`, `createLabel`, `updateLabel`, `deleteLabel`
- `comments.ts`: `listIssueComments`, `listProjectComments`, `postIssueComment`, `postProjectComment`
- `issues.ts`: `createIssue`, `getIssue`, `updateIssue`, `moveIssue`, `getBoard`, `listIssues`, `getMyIssues`
- `profile.ts`: `updateProfile`, `changePassword`

**Unchanged:**
- `GET /api/me`: it maps the member through `profileResponse`, a helper, not a domain call.
- The `[...path]` 404 route.

### Tests

Tests are named after the spec example they close.

**`src/server/api-route.test.ts`:**
- Removed, because the `"admin"` mode no longer exists:
  - "SEC-006.1: a member's request to an admin-only route gets 403…"
  - "SEC-006: an admin's request reaches the admin-only handler…"
  - "a member's invalid body on an admin-only route gets 422…"
- Rewritten: "REQ-052: the handler gets the member's role as stored now, not as at sign-in".
- Added:
  - "SEC-007: a signed-in request's log line names the actor by username only"
  - "SEC-007: a signed-out request's 401 log line has no actor"

**Domain tests, called directly with a plain member:**
- `src/server/projects.test.ts`:
  - "SEC-006.1: a member deleting project WEB gets 403 and WEB remains"
  - "SEC-006.1: a member deleting a missing project gets 403, not 404"
  - "STD-2: a member can't create a project"
  - "STD-2: a member can't rename a project"
  - "STD-2: a member can't archive a project"
  - "REQ-052.2: Jo, no longer an admin, saving a rename on project settings gets You don't have permission to do that."
  - "REQ-012: a member can still save a description through updateProject"
- `src/server/members.test.ts`: "STD-2: a member can't change a role or deactivate"
- `src/server/invitations.test.ts` (new):
  - "STD-2: a member can't list invitations"
  - "STD-2: a member can't invite"
  - "STD-2: a member can't resend an invitation"
  - "STD-2: a member can't revoke an invitation"

**Route test, moved:** "STD-3: a member's invalid body to create a project gets 422, and a valid one gets 403", in `src/app/api/projects/route.test.ts`.

**Kept unchanged, as end-to-end regression guards:**
- the existing STD-2 route tests for projects, members and invitations;
- REQ-052.2 in `members/[username]/route.test.ts`;
- the ownership tests in `comments/[id]` and `issues/[id]`.

### Order

Each step leaves `npm run typecheck`, `npm run lint` and `npm test` green, and is its own commit.

1. **Docs and permissions.**
   - Docs: this ADR, tech-design §1.2, D-42's order sentence, a new D-43 row, and the CLAUDE.md request flow plus the coding rule "Domain functions take `actor` first and own every role and ownership check; routes never check roles."
   - Code: `assertAdmin` in `sessions.ts`; `actor` first and admin checks in `projects.ts`, `members.ts` and `invitations.ts`, with their routes; remove `"admin"` from `apiRoute`; delete `requireAdmin`; add the actor to the log line.
   - Tests: all of the above.
   - This is one step because the `"admin"` mode can only be removed after all 7 of its call sites have moved.
2. **`actor` first everywhere else:** `issues.ts`, `comments.ts`, `labels.ts`, `profile.ts`, and their routes. No behaviour changes, so the existing tests are the check.

### Verification

- `grep -rn 'apiRoute("admin"\|requireAdmin' src` returns nothing.
- `grep -rn 'role !== "admin"\|role === "admin"' src/server` lists only `assertAdmin`, `listMembers` and the ownership checks.
- `npm run typecheck`, `npm run lint` and `npm test` are green.
