# Test consolidation review

Proposed: **859 → ~497 tests (−42%)**, with decisions D1–D6 applied. Nothing edited yet. The count treats each `it.each` row as one test, which is how vitest counts them.

| Area | Now | Proposed | Detail |
|---|---|---|---|
| Project and issue API routes | 168 | 102 (applied) | Part A |
| Other API routes | 179 | 107 (applied) | Part B |
| Server, domain and infrastructure | 174 | 100 (applied) | Part C |
| Client screens | 199 | 116 | Part D |
| Client components, UI kit, markdown | 139 | 72 | Part E |

Where a decision below disagrees with a Part's tables, the decision wins.

No spec example ID loses its last test: a merged test's name lists every ID it absorbs. No SEC-*, race or STD-5 idempotency assertion is dropped. Removing an outright duplicate of an SEC-* test (route vs `api-route.test.ts`, or route vs domain) removes a copy only, not the coverage.

## Where the savings come from
1. **Merging tests that share setup (most of the cut).** These are tests split one per field error, one per server message, Cancel and confirm, before and after, or log and response. They become one test that makes several assertions in sequence.
2. **Routes re-testing `apiRoute`.** These are the 401 signed-out, 422 malformed-body and cross-site 403 checks, which belong only in `api-route.test.ts`.
3. **Route-level STD-2 403s.** The domain 403 tests are required by CLAUDE.md, so the route copies go.
4. **Shared client code re-tested on every screen.** This covers load-failure Retry, the 300 ms loading delay, the description editor and the title tooltip.
5. **Tests of libraries and test doubles.** These are react-aria focus and ARIA behaviour, the outbox's fail-on-demand switch, harness factories, and simple render-and-class checks in the UI kit.

## Conflicts between batches, resolved
1. **Pop.test.** Part E removes all of `Pop.test.tsx` (11 → 0) because the screens cover it. Part D removes the Members menu "Escape and focus return" test because `Pop.test` covers it. Both can't happen. **Resolution:** keep one `Pop.test` test for menu Escape and focus return. Under the component-driven rule, kit components keep a minimal test of their own.
2. **REQ-053.8.** Part C would keep the route test, and Part B would remove it. **Resolution:** follow B. Remove the route copy and rename `notification-stats.test.ts` to "REQ-053.8, STD-2: …".
3. **REQ-013.4 and REQ-007.4.** One batch removes the domain copy and another removes the route copy. They were checked against each other, and in each case one test still names the ID: the REQ-013.4 route test after merging, and the merged 401 test in `sessions.test.ts`.

## Decisions (agreed with the owner)
- **D1. UI kit: keep one test per component.** Each kit component in `src/components/ui/track-lite/` keeps at least one test, of behaviour we set up ourselves (Escape and focus return, the filter's ×, the default `type="button"`). Compared with Part E, `Pop`, `Table`, `IssueLayout` and `Button` keep 1 test each instead of 0.
- **D2. Migration tests: keep one smoke test.** Keep "the migration applies to an empty database" and the enum sort-order check, and drop the §2.6 backfill and carry-over tests.
- **D3. Invitation 403s: keep one test per function.** The CLAUDE.md rule stands, so the four invitation STD-2 tests in `invitations.test.ts` stay separate.
- **D4. Shared error state: switch to the shared component.** Labels, Members, AcceptInvitation and ResetPassword move to the shared "Couldn't load this." component in a separate refactor step. Their own load-failure tests are then removed (4 tests).
- **D5. Test helper: add `deferred()`.** It goes in `src/test/client-app.tsx`, so the "disabled while saving" tests can merge into their happy-path tests.
- **D6. Shared test data: drop the test.** Delete "REQ-013: the Archived list is empty when no project is archived" (`projects/route.test.ts`). The archive/unarchive test above it already covers the Archived list, and this one deletes every project from the shared table.

## Rules to stop the count growing again (proposed for CLAUDE.md)
- A route test never re-tests what `apiRoute` does (401, 422 for a malformed body, cross-site 403). It tests only this route's own rules.
- A permission rule is tested once, at the domain layer.
- Test once per code path, not once per message or input. Several error messages on one path make one test.
- Shared client behaviour (loading, load failure, toasts, the editor) is tested in its own component, not on every screen.
- Don't test a library's own behaviour (react-aria, Valibot, drizzle) or the test doubles.

---

# Part A

## Test audit A: project/issue/board/comment/label API routes

Scope: 9 route test files (168 tests). Cross-checked against `src/server/api-route.test.ts`, `src/server/projects.test.ts`, `src/server/labels.test.ts`, `src/server/sessions.test.ts`, `src/lib/markdown/parse.test.ts`.

Note: there is no `src/server/issues.test.ts` or `comments.test.ts`, so for issues, board, position and comments the route tests are the only tests of the domain. Most savings come from merging tests that share setup, not from removing coverage.

| File | Current | Proposed |
|---|---|---|
| src/app/api/projects/[key]/issues/route.test.ts | 43 | 28 |
| src/app/api/issues/[id]/route.test.ts | 40 | 25 |
| src/app/api/projects/[key]/route.test.ts | 23 | 14 |
| src/app/api/issues/[id]/position/route.test.ts | 14 | 8 |
| src/app/api/projects/route.test.ts | 14 | 6 |
| src/app/api/projects/[key]/board/route.test.ts | 12 | 6 |
| src/app/api/issues/[id]/comments/route.test.ts | 11 | 7 |
| src/app/api/projects/[key]/labels/route.test.ts | 8 | 5 |
| src/app/api/projects/[key]/comments/route.test.ts | 3 | 3 |
| **Total** | **168** | **102** |

---

### src/app/api/projects/[key]/issues/route.test.ts: 43 → 28

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-016.3: a title of only spaces gets the field error Title required | MERGE | new "REQ-016.3, STD-5: a blank or 201-char title and a non-UUID requestId get field errors and create nothing" | All three are single 422s against the create schema with the same setup (one project, assert no issues). |
| REQ-016: a 201-character title gets Too long (max 200) | MERGE | same as above | Same schema, same setup. |
| STD-5: a requestId that isn't a UUID gets a field error | MERGE | same as above | Same schema, same setup. The STD-5 repeat test stays separate. |
| REQ-036.1: exactly 100 issues fit on one page with nothing more to load | MERGE | into "REQ-036.1: WEB has 120 issues…" | One test: create 100, assert 100 and hasMore=false, add 20 Done, assert 100+true then 20+false. |
| REQ-036: the list is newest-updated first by default | MERGE | new "REQ-036, REQ-040: newest-updated first by default, key ignoring capitals, and unknown sort/dir/offset fall back to it" | Same two-or-three-issue setup as the fallback test. |
| REQ-040: an unknown sort, direction or offset falls back to the defaults | MERGE | same as above | Already asserts the default order. |
| REQ-036: the project key is matched ignoring capitals | MERGE | same as above (list with `key.toLowerCase()`) | One extra call in an existing test. Create already covers lowercase keys (REQ-016.1). |
| REQ-037.2: Unassigned and a member together match either | MERGE | into "REQ-037.2: Assignee = Unassigned → only issues with no assignee" | Same setup. Add the second query to that test. |
| REQ-037.3: a label with the same name in another project doesn't match | MERGE | into "REQ-037.3: Label = bug and frontend…" | Add another project's `bug` label and issue to the setup. The existing `toEqual` proves it doesn't match. |
| REQ-037.5: deactivated members with no issues in the project, and active members, aren't offered | MERGE | into "REQ-037.5: Jo is deactivated and still assigned…" | One setup. The exact `toEqual([jo])` on `deactivatedAssignees` already rules out the others. |
| REQ-037.5: deactivated assignees are offered whatever the filters | MERGE | same as above | Add a `?status=…` query that matches nothing and assert Jo is still offered. |
| REQ-038.4: _ and \ are plain characters too | MERGE | into "REQ-038.4: "100%"…" (rename "REQ-038.4: %, _ and \ are plain characters") | Same LIKE-escaping code path, same setup. |
| REQ-038: an empty or blank search shows every issue | MERGE | into "REQ-038.1: "login button"…" | Add `?q=%20%20` and assert all 5 rows. |
| REQ-039: Status sorts in the REQ-017 order, and reverses | MERGE | new "REQ-039: Status, ID and Last updated each sort and reverse" | One set of issues, each with a distinct number, status and updatedAt, and three asserted orders. |
| REQ-039: ID sorts by number, and reverses | MERGE | same as above | |
| REQ-039: Last updated sorts newest first, and reverses to oldest first | MERGE | same as above | |
| REQ-040: unknown usernames and priorities are ignored, and the rest still applies | MERGE | into "REQ-040.3: status=Todo is ignored…" (rename "REQ-040.3, REQ-040: unknown status, usernames and priorities are ignored") | Same "unknown filter value is dropped" rule. |
| REQ-036: a signed-out visitor gets 401 | REMOVE | api-route.test.ts "STD-1: a signed-out request with an invalid body gets 401" and "SEC-007: a signed-out request's 401 log line has no actor" | Generic `requireMember` behaviour. The route declares `"member"`, and the typecheck already enforces the wrapper. |

Kept and worth noting: REQ-016.4 (race), STD-5 repeat (idempotency), REQ-013.4, REQ-036.5, REQ-036 row shape, REQ-036 404.

### src/app/api/issues/[id]/route.test.ts: 40 → 25

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-020: GET returns the labels sorted by name, descriptionVersion and mentions | MERGE | with REQ-013.1 → "REQ-013.1, REQ-020: GET returns labels sorted by name and marks an archived project's issue archived" | Both are one GET of one issue with response-shape assertions. Add labels to the archived-project issue. |
| REQ-013.1: WEB-42 in an archived project still opens, marked archived | MERGE | same as above | |
| REQ-019.2: Sam clears the assignee → shows Unassigned | MERGE | into REQ-019.1 → "REQ-019.1, REQ-019.2: assign Alex, then clear" | Same issue: assign, then clear. |
| REQ-019: an unknown assignee gets Choose an active member | MERGE | new "REQ-019, REQ-007.2, REQ-008.2: unknown or deactivated assignee refused; deactivated shown as such; reactivated can be assigned again" | Same field error and the same assignee-check code path. |
| REQ-007.2: WEB-42 assigned to deactivated Sam still shows… | MERGE | same as above | The setup (Sam assigned and then deactivated) is identical to REQ-008.2. Continue into reactivation. |
| REQ-008.2: after Sam is reactivated, (deactivated) disappears… | MERGE | same as above | |
| REQ-017: an unknown status or priority gets a field error | MERGE | into REQ-016.3 title edit → "REQ-016.3, REQ-017: title, status and priority field errors on PATCH" | All are PATCH schema 422s on one issue. |
| §3.3: an issue PATCH with description, descriptionVersion and title gets 422 "Change one field at a time" | MERGE | into "a save must change exactly one field" (rename "§3.3: a save must change exactly one field") | Add the body to the existing loop. |
| REQ-013.4: Sam's save to WEB-42 after WEB is archived fails… | MERGE | new "REQ-013.4: on an archived project, a field save, a description save and a delete each get This project is archived" | One setup (admin, archived project). Each of the 3 code paths stays guarded (writableProject itself is unit-tested in projects.test.ts). |
| REQ-013.4: a description save to an issue in an archived project… | MERGE | same as above | |
| REQ-013.4: deleting an issue in an archived project… | MERGE | same as above | |
| a save to a deleted issue gets This issue was deleted | MERGE | new "REQ-023.3: a field save, a description save and a delete on a deleted issue get This issue was deleted" | Three tests of the same `issueGone()` outcome. Keep the `"nonsense"` id case. |
| REQ-023.3: a save to WEB-42 after it's deleted gets This issue was deleted | MERGE | same as above | |
| REQ-023: deleting an issue that's already gone gets This issue was deleted | MERGE | same as above | |
| REQ-022: an empty issue description is allowed | MERGE | into REQ-022.1 | Save the checklist at v0, then "" at v1. |
| STD-8: an issue description save without a whole-number descriptionVersion is refused | MERGE | into REQ-022.2 → "REQ-022.2, STD-8: a description too long or without a whole-number version is refused and nothing is saved" | Both are description-schema 422s that save nothing. |
| DATA-001: issue mention rows follow the current description text | MERGE | into DATA-001.3 (issue) | Second save with v1 and a new mention, then assert the rows were replaced. |
| REQ-007.4: Sam is deactivated while editing… → 401 | REMOVE | src/server/sessions.test.ts "REQ-007.4: a deactivated member's session gets 401" | `requireMember` rejects before the handler runs, so "nothing is saved" is trivially true. The REQ-007.4 ID stays covered. |
| REQ-023: an admin deletes an issue someone else created | MERGE | with REQ-023.2 → "REQ-023.2, REQ-023: a member can't delete someone else's issue; an admin can" | Same setup (issue created by Sam). Alex gets 403 and the row remains, then the admin gets 204. Both permission assertions are kept. |

Kept and worth noting: STD-8 stale-save 409 (concurrency), STD-8 status change doesn't block, REQ-023 number not reused (the only guard against a `max(number)+1` implementation, which REQ-016.2 doesn't catch), DATA-002, REQ-020.3/020.4, REQ-027.4, REQ-017 no-op save.

### src/app/api/projects/[key]/route.test.ts: 23 → 14

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| STD-4: an unknown project key is Not found | MERGE | into REQ-014.1 (rename "REQ-014.1, STD-4") | REQ-014.1 already GETs a missing project and checks the 404. Add the body assertion. |
| REQ-010.1: a request that changes the key is refused and the key stays | MERGE | with REQ-011 name rules → "REQ-010.1, REQ-011: changing the key, a blank name or a 51-char name get field errors and change nothing" | Same admin and project setup, and all are PATCH 422s. |
| REQ-013.4: a description save to an archived project is refused | MERGE | with REQ-013.7 → "REQ-013.4, REQ-013.7: on an archived project, a rename and a description save are refused" | Same archived-project setup. Both write paths stay guarded. |
| STD-2: a member can't rename, archive or delete a project | REMOVE | src/server/projects.test.ts "STD-2: a member can't rename a project", "STD-2: a member can't archive a project", "SEC-006.1: a member deleting project WEB gets 403" | The project rule says every admin-only function gets a direct domain 403 test, and those exist. The route adds only generic ApiError mapping, which api-route.test.ts covers. |
| REQ-012: an empty description is allowed | MERGE | into REQ-012.1 → "REQ-012.1, REQ-012.3: descriptions (markdown, `<script>`, empty) are stored as sent" | One project with sequential saves at v0, v1 and v2. |
| REQ-012.3: a description with `<script>alert(1)</script>` is stored as sent | MERGE | same as above | |
| §3.3: a project PATCH with a description save and archived gets 422 | MERGE | with the "…and a name" variant → one test looping both bodies | Same assertion, same setup. |
| STD-8: a description save without a whole-number descriptionVersion is refused | MERGE | into REQ-012.2 (rename "REQ-012.2, STD-8") | Both are description-schema 422s that save nothing. |
| DATA-001: mention rows follow the current description text | MERGE | into DATA-001.3 (project) | Same as the issue file. The active-only and outside-code rules also live in the shared `replaceMentions` and `findMentions`, so this test can be slimmed to one mention plus one replacement. |

Kept: REQ-016 GET by key ignoring case (response shape), REQ-011.1, REQ-013.1/013.3, REQ-014.3/014.4, DATA-002.1, STD-8 stale-save 409.

### src/app/api/issues/[id]/position/route.test.ts: 14 → 8

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-030.1: Move to → In Review puts WEB-42 at the top of In Review | MERGE | into REQ-026.1 (rename "REQ-026.1, REQ-030.1") | Exactly the same request, `{status: other, place: "top"}`, and the same assertion. |
| REQ-026.4: the card named in 'after' has left the column → top | MERGE | new "REQ-026.4: a drag from a stale board still lands: Done→In Review, and an 'after' card that left the column or is the card itself means top" | Three tests of one stale-board fallback. Use one project and sequential moves. |
| REQ-026.4: 'after' naming the moved card itself → top | MERGE | same as above | |
| REQ-026.4: Alex has moved WEB-42 to Done; Sam… drags it to In Review | MERGE | same as above | |
| REQ-027.2: Sam drags WEB-42 from Backlog between WEB-5 and WEB-9 | MERGE | with REQ-027.1 → "REQ-027.1, REQ-027.2: 'after' places a card within its column and across columns" | Same `after` placement code. One column setup with two moves. |
| REQ-030.2: Move to bottom puts WEB-5 last in In Progress | MERGE | into REQ-026.3 (rename "REQ-026.3, REQ-030.2") | REQ-026.3 already moves WEB-5 to the bottom and asserts it's last. It needs no new assertion. |
| REQ-036.5: a status change made by dragging sets updatedAt and statusChangedAt | MERGE | with "REQ-036.5: reordering … changes neither" → one test: reorder (unchanged), then change status (both bumped) | Same issue and the same aged timestamps. |

Kept: REQ-026.3 (concurrency), REQ-026.5, REQ-024.2, REQ-026 validation.

### src/app/api/projects/route.test.ts: 14 → 6

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-009.2: a lowercase key is saved in uppercase | MERGE | into REQ-009.1 → "REQ-009.1, REQ-009.2, REQ-009.5, REQ-046.2: an admin creates a project (lowercase key saved uppercase, name may repeat); every member sees it in a list without description" | Send the lowercase key in REQ-009.1. Its response already asserts the uppercase key. |
| REQ-009.5: a second project may reuse a name with a different key | MERGE | same as above | Create a second "Website" with another key and expect 201. |
| REQ-046.2: the project list carries no description | MERGE | same as above | REQ-009.1's `toContainEqual({key, name, archivedAt})` is an exact match, so it already proves there's no description. |
| REQ-009.3: a key used by an active project is refused | MERGE | into the "deleted project" REQ-009.3 test | Same error. Try both keys in one test. |
| STD-2: a member can't create a project | REMOVE | src/server/projects.test.ts "STD-2: a member can't create a project". The STD-3 test in this file also asserts a member's valid body gets 403 and creates nothing. | Duplicated at both layers. |
| STD-3: a member's invalid body to create a project gets 422, and a valid one gets 403 | REMOVE | api-route.test.ts "STD-3: a schema failure gets 422…" (`expect(handler).not.toHaveBeenCalled()`) | The ordering (schema before domain) is generic apiRoute behaviour. If the owner wants it explicit, add one line to the api-route test with a handler that throws a 403. |
| REQ-013.3: unarchiving puts a project back in the sidebar list | MERGE | into REQ-013.1 → "REQ-013.1, REQ-013.3: archiving moves a project to the Archived list; unarchiving moves it back" | Same setup: archive, then unarchive. |
| REQ-013: the Archived list is empty when no project is archived | REMOVE | none needed | Trivial (an empty query result), and its `db.delete(projects)` wipes the shared table. |

Kept: REQ-009.4, REQ-009 name rules, REQ-009 concurrent same key (race), and the merged tests.

### src/app/api/projects/[key]/board/route.test.ts: 12 → 6

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-024.1: cards in a column are sorted by position | MERGE | into "REQ-024.1: WEB with 3 Backlog and 2 In Progress…" | Give the 3 Backlog issues out-of-order positions. The `cardIds` assertion then covers sorting. |
| REQ-024: the project key is matched ignoring capitals | MERGE | into REQ-024.2 (fetch with a lowercase key; rename "REQ-024.2, REQ-024") | One extra variation in an existing call. |
| REQ-024: a signed-out visitor gets 401 | REMOVE | api-route.test.ts STD-1 and SEC-007 401 tests | Generic `requireMember`. |
| REQ-025.2: an assigned issue with a priority carries… | MERGE | with "REQ-025.2: WEB-42 is unassigned with No priority" into one test with two cards | Same board fetch, two `cardFor` assertions. |
| REQ-028.2: WEB-11 was moved to Done 3 days ago → shown | MERGE | new "REQ-028.1, REQ-028.2, REQ-028: Done/Canceled hidden after 14 days, shown within; other statuses never hidden" | One board with 20-day-old Done/Canceled, 3-day-old Done/Canceled and a 20-day-old Backlog issue. Each count and card assertion stays. |
| REQ-028.1: WEB-10 was moved to Done 20 days ago → not on the board | MERGE | same as above | |
| REQ-028: an old status change doesn't hide issues outside Done and Canceled | MERGE | same as above | |

Kept: REQ-024 404 (getBoard has its own lookup), REQ-025.1.

### src/app/api/issues/[id]/comments/route.test.ts: 11 → 7

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-031: an empty or all-spaces comment is refused | MERGE | new "REQ-031, REQ-031.3, STD-5: empty, too-long and missing-requestId comments get field errors; 10,000 chars is fine" | All are comment-schema 422s on the same issue. |
| REQ-031.3: a comment of 10,001 characters gets "Too long (max 10,000)" | MERGE | same as above | |
| STD-5: a post without a valid requestId is refused | MERGE | same as above | The STD-5 repeat test stays separate. |
| REQ-031: a comment is stored as sent, so an indented code block at the start survives | MERGE | into REQ-031.1 (post a second comment, or make the 031.1 body start with 4 spaces) | One assertion on the returned body. |
| DATA-001.3: comment mentions are active members only, outside code | REMOVE | issue DATA-001.3 (same `replaceMentions`), plus src/lib/markdown/parse.test.ts DATA-001.4/001.6. REQ-031.1 already asserts the comment's mention row and response. | The third copy of the same rule matrix through a shared helper. Only the wiring is comment-specific, and REQ-031.1 covers it. |

Kept: REQ-031.1, STD-5 repeat, REQ-032.1, REQ-032.4, REQ-032.3, deleted-issue post/list.

### src/app/api/projects/[key]/labels/route.test.ts: 8 → 5

| Test | Action | Target / covered by | Reason |
|---|---|---|---|
| REQ-021.2: creating BUG while bug exists is refused with Label already exists | REMOVE | src/server/labels.test.ts "REQ-021.2: two concurrent creates of bug and BUG leave one label" | `createLabel` has no pre-check. Both cases go through the same unique-constraint mapping (`refusingDuplicateNames`), and the race test asserts the same 422 and message for bug vs BUG. |
| REQ-021: an empty or too-long name and an unknown color get field errors | MERGE | with "REQ-021: a new label is created with a trimmed name…" → one test | Same project. Valid create, then the invalid ones. |
| REQ-013.5: an archived project's labels are still listed | MERGE | with REQ-013.4 → "REQ-013.4, REQ-013.5: an archived project's labels list, but creating one is refused" | Same archived-project setup. |

Kept: REQ-021.5, REQ-021.4, STD-4.

### src/app/api/projects/[key]/comments/route.test.ts: 3 → 3

All KEEP. The file is already lean.

---

### Cross-cutting patterns

1. **Schema-validation tests split one per field or limit.** This is the biggest source of extra tests. Blank title, long title, bad requestId, bad status and so on each get their own test, though they share setup and the same 422 shape. Merge them into one "field errors" test per endpoint that lists every ID. apiRoute's generic 422 mapping is already covered once in api-route.test.ts.
2. **Generic apiRoute or session behaviour re-tested per route:**
   - signed-out 401 on the issue list and the board;
   - REQ-007.4 deactivated → 401 on a description save;
   - STD-3 "422 before 403" on project create;
   - member 403 on project routes, which duplicates the mandatory domain 403 tests in projects.test.ts.
   Remove them.
3. **Cross-layer duplication:**
   - STD-2 (create, rename, archive, delete) is tested in both projects.test.ts and the route tests.
   - REQ-021.2 is tested in both labels.test.ts and the route.
   - Also, outside my files, `projects.test.ts` "REQ-012: a member can still save a description through updateProject" duplicates the route test REQ-012.1, and its STD-2 rename and archive tests could become one test.
4. **The same helper is tested through every caller.** DATA-001.3 (shared `replaceMentions`), STD-8 (shared `conflict`) and REQ-013.4 (shared `writableProject`, already unit-tested) are tested once per entity.
   - Keep one wiring test per domain write path, merged per file. For REQ-013.4 that means one test per file that tries every write, which the CLAUDE.md rule about domain ownership requires.
   - Keep the full DATA-001.3 rule matrix only once (on the issue description).
5. **Positive and negative halves of one rule written as two tests:**
   - assign/clear;
   - archive/unarchive;
   - reorder keeps timestamps vs status change bumps them;
   - deactivated/reactivated;
   - hidden after 14 days vs shown within.
   One test with sequential steps reads as better documentation.
6. **Identical requests under different spec IDs.** REQ-026.1 and REQ-030.1 send the same move. REQ-026.3 already proves REQ-030.2. Prefer one test whose name lists both IDs.
7. **api-route.test.ts itself (optional, outside the main scope):**
   - The 4 SEC-004 allow/deny variants could become 2 tests (deny: no-Origin+cross-site, neither header; allow: matching Origin, same-origin).
   - The two "Couldn't read the request." tests could merge.
   - The ApiError with/without fields tests could merge.
   That would save about 4 tests and keep every assertion.
8. **Shared-DB hazard.** projects/route.test.ts "REQ-013: the Archived list is empty…" runs `db.delete(projects)`. Another reason to drop it.

All merges keep every assertion and every spec example ID in the merged test's name. Nothing proposed touches a race test (REQ-016.4, REQ-026.3, REQ-009 concurrent create, STD-8 stale saves) or a SEC-* test.

---

# Part B

## Test consolidation review B: members, sessions, me, invitations, password resets, comments, labels, my-issues, stats, catch-all, health, webhook

All paths are under `src/app/` unless noted. Counts treat each `it.each` row as one test.

### Summary

| File | Current | Proposed |
|---|---|---|
| api/members/[username]/route.test.ts | 20 | 9 |
| api/members/route.test.ts | 15 | 9 |
| api/sessions/route.test.ts | 14 | 8 |
| api/sessions/current/route.test.ts | 2 | 1 |
| api/me/route.test.ts | 11 | 5 |
| api/me/password/route.test.ts | 5 | 3 |
| api/invitations/route.test.ts | 12 | 6 |
| api/invitations/[id]/route.test.ts | 4 | 2 |
| api/invitations/[id]/resend/route.test.ts | 7 | 4 |
| api/invitation-lookups/route.test.ts | 4 | 2 |
| api/password-resets/route.test.ts | 7 | 3 |
| api/password-reset-links/route.test.ts | 7 | 6 |
| api/password-reset-lookups/route.test.ts | 4 | 2 |
| api/comments/[id]/route.test.ts | 13 | 9 |
| api/labels/[id]/route.test.ts | 8 | 6 |
| api/my-issues/route.test.ts | 12 | 8 |
| api/notification-stats/route.test.ts | 10 | 8 |
| api/[...path]/route.test.ts | 5 | 3 |
| health/route.test.ts | 2 | 1 |
| health/worker/route.test.ts | 6 | 4 |
| webhooks/email/route.test.ts | 11 | 8 |
| **Total** | **179** | **107** |

No spec example ID loses its last test. Every merged test name lists every ID it covers.

---

### api/members/[username]/route.test.ts: 20 → 9

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-007.1: a deactivated member's next page load is signed out | MERGE | → "REQ-007.1, REQ-007.4: deactivating Sam ends their sessions; a save mid-edit gets 401 and nothing is saved" | Same setup (admin + Sam, deactivate once), then assert getMe 401, sessions gone, PATCH /me 401 with nothing saved |
| REQ-007.4: a member deactivated mid-edit gets 401 and nothing is saved | MERGE | same as above | Same setup |
| REQ-007.1: a deactivated member's correct password gets "Incorrect email or password." | MERGE | → "REQ-007.1, REQ-007.5: a deactivated member can't sign in, request a reset or use an earlier reset link" | Same setup; take the reset token before deactivating, then assert sign-in 422, reset request sends nothing, earlier link 410 |
| REQ-007.1: a deactivated member's reset request sends nothing | MERGE | same as above | Same setup |
| REQ-007.5: a reset link used after deactivation shows "This link has expired" | MERGE | same as above | Same setup |
| REQ-007.3: the only admin can't remove their own admin role | MERGE | → "REQ-007.3: the only admin can't deactivate themselves or remove their own admin role" | Same setup (makeOnlyAdmins(alex)), two PATCHes |
| REQ-052.1: a member made admin is an admin from their next request | MERGE | absorbs "§3.1: the username is matched ignoring capitals" | PATCH with `sam.username.toUpperCase()` in REQ-052.1, name it "REQ-052.1, §3.1" |
| §3.1: the username is matched ignoring capitals | MERGE | → REQ-052.1 | See above |
| STD-2: a member can't change roles or deactivate | REMOVE | src/server/members.test.ts "STD-2: a member can't change a role or deactivate" | Identical rule. CLAUDE.md requires the domain-level 403 test, so the route copy is the redundant one |
| STD-3: a member's malformed JSON on a member change gets 422 … | REMOVE | src/server/api-route.test.ts "a body that isn't valid JSON gets 422 …" | Generic apiRoute body parsing |
| STD-3: an admin setting a role other than admin or member gets 422 | MERGE | → "STD-3: an invalid role or deactivated gets its field error and changes nothing" | Same file holds 4 tests for 2 cases |
| STD-3: an admin setting deactivated to something other than true or false gets 422 | MERGE | same as above | |
| it.each "STD-3: an invalid role gets 422 with a field error…" | REMOVE | covered by the merged STD-3 test | Exact duplicate of the two named tests above |
| it.each "STD-3: an invalid deactivated gets 422…" | REMOVE | covered by the merged STD-3 test | Exact duplicate |

Kept as they are: REQ-008.1, REQ-052.2, REQ-052.3 (concurrency), §3.2 404.

### api/members/route.test.ts: 15 → 9

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-007.2: the member list marks a deactivated member | MERGE | → "§3.3, REQ-007.2, REQ-008.2: members get every member, deactivated ones marked, without emails or roles" | §3.3 already asserts Jo `deactivated: true` |
| REQ-008.2: the member list no longer marks a reactivated member | MERGE | same as above | Add a reactivated member to the same list call |
| STD-1: signed out gets 401 | REMOVE | api-route.test.ts STD-1 and SEC-007 401 tests; [...path] API-001 | Generic apiRoute auth |
| REQ-002.2: a link on day 8 has expired | MERGE | → "REQ-002.2: accepting a day-8, already accepted, unknown or replaced link has expired and creates no member" | All four go through `usableInvitation()`; one invitation per case, one test |
| REQ-002.2: a link already accepted has expired | MERGE | same as above | |
| REQ-002.2: an unknown link or one replaced by a resend has expired | MERGE | same as above | |
| REQ-003.1: username Sam is saved as sam | MERGE | → REQ-002.1, renamed "REQ-002.1, REQ-003.1" | Accept with a capitalised username in REQ-002.1 and assert the lower-cased one |

Kept: §3.3 (merged), REQ-051, REQ-002.1 (merged), REQ-002.3/STD-2, stale cookie, REQ-002.4, REQ-003.2, REQ-003/REQ-048.

### api/sessions/route.test.ts: 14 → 8

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-047.4: the email matches ignoring capitals | MERGE | → "REQ-047.1, REQ-047.4, §4.1: an active member signs in with any capitals; a current hash isn't rewritten" | Same happy path |
| §4.1: a current hash isn't rewritten | MERGE | same as above | One extra assertion after a successful sign-in |
| REQ-047.3: an unknown email gets the same refusal | MERGE | → "REQ-047.2, REQ-047.3, REQ-047: wrong password, unknown email and deactivated member get the same refusal" | Enumeration check is easier to read when the three answers sit side by side; all assertions kept |
| REQ-047: a deactivated member with the right password gets the same refusal | MERGE | same as above | Also asserted by REQ-007.1 in members/[username] |
| SEC-001.1: 10 wrong passwords, then the right one, is refused | MERGE | → "SEC-001.1: 10 wrong passwords lock the right one out, even with a success in between" | "a successful sign-in doesn't reset the count" already makes 10 failures and then expects 429 for the right password. Optional, since this is security code. Keep both if you prefer |
| SEC-001: a successful sign-in doesn't reset the count | MERGE | same as above | |
| §4.1: a wrong password leaves the old hash alone | MERGE | → "§4.1: a wrong password leaves an older hash alone; the right one rehashes it" | Same member: wrong password first, then right |

Kept: REQ-047.5, SEC-001.3, SEC-001 IP / X-Forwarded-For, SEC-001 hour window.

### api/sessions/current/route.test.ts: 2 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-006: signing out without a session still answers 204 | MERGE | → "REQ-006: signing out ends the session on this browser only, and works again without a session" | Add `signOut()` with no cookie at the end |

### api/me/route.test.ts: 11 → 5

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| STD-1: GET /api/me signed out answers 401 | REMOVE | api-route.test.ts STD-1 | Generic apiRoute auth |
| STD-1: PATCH /api/me signed out answers 401 | REMOVE | api-route.test.ts STD-1 | Generic apiRoute auth |
| REQ-003: the full name is trimmed | MERGE | → "REQ-003.3, REQ-003: PATCH /api/me saves a new, trimmed full name" | Send "  Sam Lee  " in the save test |
| it.each REQ-003 "" gets "Name required" | MERGE | → "REQ-003: an empty, blank or over-60 name is refused; 60 after trimming is saved" | One member, sequential PATCHes |
| it.each REQ-003 "   " gets "Name required" | MERGE | same as above | |
| REQ-003: a name over 60 characters after trimming gets "Too long (max 60)" | MERGE | same as above | |
| it.each REQ-003.3 changing the username is refused | MERGE | → "REQ-003.3: changing the username or email is refused" | One test, two PATCHes |
| it.each REQ-003.3 changing the email is refused | MERGE | same as above | |

Kept: REQ-003.3 GET, SEC-008.2. SEC-008.2 could be folded into the GET test too, but I left it separate on purpose.

### api/me/password/route.test.ts: 5 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| SEC-001: wrong current passwords count toward the sign-in limit | REMOVE | REQ-049.3 in the same file, renamed "REQ-049.3, SEC-001" | REQ-049.3 already does 10 wrong current passwords and then asserts sign-in answers 429 |
| REQ-048: a new password that is too short gets "At least 12 characters" | MERGE | → "REQ-049.2, REQ-048: a wrong current password or a too-short new one is refused and the old password still works" | Same setup and the same "old password still works" check. The length rule itself is unit-tested in src/schemas/password.test.ts; this only proves the route is wired to it |

### api/invitations/route.test.ts: 12 → 6

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-001.5: inviting Sam@Acme.com while sam@acme.com is a member → "Already a member" | MERGE | → "REQ-001.2, REQ-001.5, REQ-001.6: inviting a member (any capitals) or a deactivated person is refused with no email" | Same refusal path (`assertNotMember`) |
| REQ-001.6: inviting deactivated Jo → "This person is deactivated…" | MERGE | same as above | |
| REQ-001: an email with spaces around it and capitals is invited trimmed and lower-cased | MERGE | → REQ-001.1 | Invite `  ${EMAIL} ` in REQ-001.1; it already checks the created email, outbox and list |
| STD-2: a member who isn't an admin gets 403 from list and invite | REMOVE | src/server/invitations.test.ts STD-2 list / invite | Domain test required by CLAUDE.md; it also checks no row and no email |
| STD-3: a member's malformed JSON to invite gets 422 … | REMOVE | api-route.test.ts invalid JSON 422 | Generic apiRoute |
| STD-3: an invite with no email gets 422 "Required" | MERGE | → "STD-3: a missing or malformed email gets a field error" | Same loop; add `undefined` with its own expected message |

Kept: REQ-001.1 (merged), refusals (merged), REQ-001.7, open-invitation resend, list states, STD-3 (merged).

### api/invitations/[id]/route.test.ts: 4 → 2

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-001: after revoking, the same email can be invited again | MERGE | → "REQ-001.4, REQ-001: revoking stops the link, and the email can be invited again" | Continue the REQ-001.4 flow |
| STD-2: a member who isn't an admin can't revoke | REMOVE | src/server/invitations.test.ts "STD-2: a member can't revoke an invitation" | Domain test checks `revokedAt` is still null |

### api/invitations/[id]/resend/route.test.ts: 7 → 4

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-001: a resend names the admin who resent it | MERGE | → REQ-001.3, renamed "REQ-001.3, REQ-001" | Have Jo (a second admin) do the resend in REQ-001.3 and assert `invitedBy` and the subject |
| REQ-001: resending a bounced invitation shows it as Pending again | MERGE | → "REQ-051.3, REQ-001: resending an expired or bounced invitation makes it Pending for 7 days" | Same assertion on state |
| STD-2: a member who isn't an admin can't resend | REMOVE | src/server/invitations.test.ts "STD-2: a member can't resend an invitation" | Domain test also checks the token and outbox |

### api/invitation-lookups/route.test.ts: 4 → 2

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-002.2: a link opened on day 8 has expired | MERGE | → "REQ-002.2: an unknown, malformed, day-8 or accepted link has expired" | Same `expectExpired` helper; set up two invitations in one test |
| REQ-002.2: a link that was already accepted has expired | MERGE | same as above | |

### api/password-resets/route.test.ts: 7 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-050.4: a link already used is refused | MERGE | → "REQ-050.3, REQ-050.4, REQ-050.6, REQ-050.7: a reset sets the password, signs Sam in, ends other sessions and earlier links, and can't be reused" | Same happy-path setup: make the first link and the other session, reset with the second link, then assert reuse 410 and first link 410 |
| REQ-050.6: resetting with the second link expires the first | MERGE | same as above | |
| REQ-050.7: resetting ends Sam's session on another computer | MERGE | same as above | |
| REQ-050: a member deactivated since the link was sent gets 410 | REMOVE | members/[username] REQ-007.5 (merged into REQ-007.1/007.5) | REQ-007.5 is the same scenario through the real deactivate API, and it also checks no cookie and the password unchanged |

Kept: REQ-050.4 (31 minutes), REQ-048 (keeps link usable on 422).

### api/password-reset-links/route.test.ts: 7 → 6

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-050: a deactivated member gets the same 204 and no email | MERGE | → "REQ-050.2, REQ-050: an unknown email or a deactivated member gets the same 204 and no email" | Same assertion. Also covered by REQ-007.1 in members/[username] |

All SEC-001 rate-limit tests and STD-6 stay.

### api/password-reset-lookups/route.test.ts: 4 → 2

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-050.9: a link 31 minutes after sending is expired | MERGE | → "REQ-050.9: a malformed link or one 31 minutes old is expired" | Same helper |
| REQ-050.8: a signed-in member's lookup doesn't use the link… | MERGE | → "REQ-050.5, REQ-050.8: lookups by a mail scanner or a signed-in member don't use the link" | Do one anonymous lookup and one with Alex's cookie, sign out, then reset → 204 |

### api/comments/[id]/route.test.ts: 13 → 9

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| DATA-001: comment mention rows follow the current text | MERGE | → REQ-033.1, renamed "REQ-033.1, DATA-001" | REQ-033.1 already checks mention rows; add a second edit that swaps the mention |
| REQ-034.3: Alex, a member, can't delete Sam's comment | MERGE | → "REQ-033.2, REQ-034.3: an admin can't edit, and another member can't delete, Sam's comment" | Same `onIssue()` setup and the same 403 body |
| REQ-034.2: an admin deletes Alex's comment → it's gone | MERGE | → REQ-034.4, renamed "REQ-034.2, REQ-034.4" | REQ-034.4 already has an admin delete someone else's comment and assert it's gone |
| deleting a comment that's gone, or an ID that isn't one, gets This comment was deleted | MERGE | → REQ-033.3, renamed "REQ-033.3, STD-4" | Same 404 message; after the admin delete, also delete again and try a random or non-UUID id |

Kept: REQ-033.1 (merged), STD-8, REQ-033 limits, REQ-034.1, REQ-034.4 (merged), REQ-013 archived, project comment.

### api/labels/[id]/route.test.ts: 8 → 6

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-021: a label is recolored | MERGE | → REQ-021.1, renamed "REQ-021.1, REQ-021" | PATCH `{ name: " defect ", color: "blue" }` and assert both |
| REQ-013.6: renaming a label in an archived project is refused… | MERGE | → "REQ-013.4, REQ-013.6: renaming, recoloring or deleting a label in an archived project is refused" | Same setup, one more request |

### api/my-issues/route.test.ts: 12 → 8

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-041.2: Done and Canceled issues moved there 3 days ago are shown | MERGE | → "REQ-041.2: Done and Canceled show for 14 days: 20 days ago hidden, 3 days ago shown" | Same member and project |
| REQ-041.3: project API is archived → API-7 isn't shown | MERGE | → "REQ-041.3, REQ-013.2, REQ-013.3: archiving hides a project's issues from My issues; unarchiving brings them back" | REQ-013.2 is the same rule through the archive API |
| REQ-013.3: admin unarchives WEB → WEB-42 is back | MERGE | same as above | Continues the REQ-013.2 flow |
| REQ-041: a signed-out visitor gets 401 | REMOVE | api-route.test.ts STD-1 | Generic apiRoute auth |

Kept: REQ-041.1, 041.4, 041.5 (300 issues, 30 s timeout, the slowest here), row shape, REQ-042.1, REQ-042.

### api/notification-stats/route.test.ts: 10 → 8

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-053.8: Alex, a member, asks for the stats → 403 | REMOVE | src/server/notification-stats.test.ts "STD-2: a member can't read notification stats" | Same assertion. Rename the server test "REQ-053.8, STD-2: …" so the spec ID survives |
| REQ-053.6: nothing has failed or bounced → an empty recent list | MERGE | → "REQ-053.5, REQ-053.6: before the worker runs and with nothing failed, there's no last pass and the recent list is empty" | Both are empty-state checks; the 2 sent deliveries don't affect `workerLastPassAt` |

### api/[...path]/route.test.ts: 5 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| API-001: a same-site write to an unknown /api path answers 401 | MERGE | → "API-001: an unknown /api path answers 401 to a signed-out read or write" | Two requests, one test |
| SEC-004.1: a signed-in member's cross-site DELETE of WEB-42 is rejected with 403 | MERGE | → "API-001, SEC-004.1: signed in, an unknown /api path answers 404 and a cross-site DELETE answers 403" | SEC-004.1 already has its own test in api-route.test.ts. This copy only proves the catch-all is wrapped, so it can share the signed-in setup. The assertion is kept |

Kept: REQ-006 cookie renewal.

### health/route.test.ts: 2 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| OPS-005.1: /health answers 503 when the database doesn't respond | MERGE | → "OPS-005, OPS-005.1: /health answers 200 when the database responds and 503 when it doesn't" | Two GETs; `mockRejectedValueOnce` before the second |

### health/worker/route.test.ts: 6 → 4

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| OPS-005.3: the worker has never finished a pass → 503 | MERGE | → "OPS-005.2, OPS-005.3: no pass yet, or a last pass 3 minutes ago → 503" | GET before inserting the heartbeat, then again after |
| OPS-005.5: nothing due → 200; a delivery waiting for a retry isn't due | MERGE | → "OPS-005.5: a due delivery 1 minute old, or one waiting for a retry, → 200" | Same heartbeat; add the deliveries one by one |

### webhooks/email/route.test.ts: 11 → 8

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-053: a bounce records when the email bounced, and it then counts as bounced… | MERGE | → API-003.1, renamed "API-003.1, REQ-053" | Same bounce of a sent notification; add the `stateChangedAt` and count assertions |
| §5.4: a signed body that is JSON but not an object gets 200 and changes nothing | MERGE | → "§5.4: a signed body that isn't JSON, isn't an object or has no data.email_id gets 200, changes nothing and logs no message id" | All three check "ignored" logging and no state change |
| §5.4: a signed email.bounced with no data.email_id gets 200 and changes nothing | MERGE | same as above | |

All API-003.3 and API-003.4 signature and replay tests, API-003.5, API-003.6 and the multi-v1 signature test stay.

---

### Cross-layer findings outside my files (for whoever owns src/server/)

- `src/server/sessions.test.ts` "REQ-006: signing out ends the session on that browser only" duplicates sessions/current "REQ-006: signing out ends the session on this browser only". The route test is strictly stronger (it also checks the cookie is cleared). Remove the server copy.
- `src/server/notification-stats.test.ts` STD-2: rename to "REQ-053.8, STD-2: …" once the route copy goes.
- `src/server/invitations.test.ts` and `members.test.ts` STD-2 tests become the only STD-2 coverage for those routes. That is the intended layering (CLAUDE.md, §4.10).
- `src/server/api-route.test.ts` already covers STD-1 (401), invalid JSON 422, non-object 422, SEC-004 cross-site handling and STD-3 schema mapping. Nothing in my files needs to repeat them.

### Cross-cutting patterns

1. **Per-route copies of apiRoute behaviour** (9 tests): signed-out 401 (members, me ×2, my-issues), malformed JSON 422 (members/[username], invitations), cross-site 403 ([...path]). api-route.test.ts owns these. One honest gap: no test checks that a route isn't wrongly declared `"public"`. If you want that guard, one table-driven test (a plain loop, not `it.each`) over every non-public handler, asserting 401, costs 1 test instead of N.
2. **STD-2 checked at both route and domain** (5 tests: members/[username], invitations, invitations/[id], resend, notification-stats). CLAUDE.md requires the domain 403 test, so drop the route copy every time. REQ-052.2 is the exception: it tests that a role change takes effect on the next request, and it stays.
3. **The same scenario reached from two entry points**: a deactivated member's sign-in, reset request and reset use are each tested in members/[username] (REQ-007.x) and again in sessions, password-reset-links and password-resets. Keep the end-to-end REQ-007 version, which deactivates through the API, and drop the copy that sets `deactivatedAt` directly.
4. **One test per input row** where the setup is shared: REQ-002.2 expiry variants (×3 in two files), REQ-050.9, REQ-041.2, OPS-005.2/.3, OPS-005.5, the §5.4 malformed bodies, and name validation in /me. Several files already use the better pattern of one test with a loop over inputs (invitations STD-3, labels STD-4); apply it everywhere.
5. **Exact duplicates in the same file**: members/[username] has two named STD-3 tests plus an `it.each` over the same two inputs. Grep for this pattern repo-wide.
6. **Follow-on assertions written as separate tests**: "after revoking, invite again", "resend names the resender", "§3.1 case-insensitive", "current hash isn't rewritten", DATA-001 mention swap. Each is one or two extra lines at the end of an existing flow.
7. **Two kinds of security merge**: some security merges keep every assertion but change the test layout (sessions SEC-001.1 with "success doesn't reset", and REQ-047.2/.3 with deactivated). They are flagged optional. Nothing that guards against enumeration, rate-limit bypass or webhook signature or replay problems is removed outright.

---

# Part C

## Test audit C: server domain, infra and meta tests

Scope: 23 files, **174 tests now, 102 proposed** (99 if the owner agrees to merge the invitation 403s).
Each `it.each` row counts as one test (members.test.ts has 5 rows, setup.test.ts has 4).

The layer rule used throughout:
- **Authorization (STD-2 / SEC-006 403s) belongs to the domain layer.** CLAUDE.md requires a direct 403 test per admin-only domain function, so those stay. The route-level STD-2 tests that repeat them are the redundant copies (they are outside this file set and listed at the end).
- **Behaviour reachable through a route belongs to the route test.** Domain tests that replay a route-covered example (archived write, 404, sign-out, description save) are removed.
- **Concurrency, races, lease handling and token hashing stay**, even where a merge is proposed. Every merge keeps every assertion.

| File | Now | Proposed |
|---|---:|---:|
| src/server/worker.test.ts | 31 | 22 |
| src/server/api-route.test.ts | 25 | 13 |
| src/server/notifications.test.ts | 19 | 13 |
| src/server/email/templates.test.ts | 10 | 3 |
| src/server/email/send.test.ts | 4 | 3 |
| src/server/projects.test.ts | 10 | 5 |
| src/server/cleanup.test.ts | 9 | 6 |
| src/server/sessions.test.ts | 9 | 4 |
| src/server/seed-load.test.ts | 7 | 5 |
| src/server/schema.test.ts | 5 | 4 |
| src/server/invitations.test.ts | 4 | 4 (1 with owner OK) |
| src/server/setup.test.ts | 7 | 3 |
| src/server/seed.test.ts | 4 | 3 |
| src/server/members.test.ts | 6 | 2 |
| src/server/passwords.test.ts | 2 | 2 |
| src/server/labels.test.ts | 1 | 1 |
| src/server/tokens.test.ts | 1 | 0 (merged into sessions) |
| src/server/notification-stats.test.ts | 1 | 1 |
| src/proxy.test.ts | 6 | 3 |
| src/instrumentation.test.ts | 4 | 2 |
| src/repository.test.ts | 2 | 1 |
| src/test/harness.test.ts | 3 | 1 |
| src/schemas/password.test.ts | 4 | 1 |
| **Total** | **174** | **102** |

---

### src/server/worker.test.ts: 31 → 22

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-045: an email isn't sent before its 2 minutes are up | MERGE | → "REQ-045, REQ-053: a pending email waits 2 minutes, then is sent and its send time recorded" | Same setup (assign, then sendAllDue). Check it isn't sent, call waitIsOver, run again and check it is sent |
| REQ-045: a due email is sent and recorded | MERGE | same as above | Same setup |
| REQ-053: the worker records when a delivery was sent | MERGE | same as above | Same flow. The `stateChangesOf` checks before and after slot in directly |
| REQ-045.2: reassigned to Jo during the wait → … | MERGE | → "REQ-045.2, REQ-053: reassigned to Jo during the wait → Sam's delivery is dropped with its time; Jo gets one email" | Setup is identical to the REQ-053 dropped test |
| REQ-053: the worker records when a delivery was dropped | MERGE | same as above | Identical setup |
| REQ-045.3: mention edited out during the wait → Sam gets nothing | MERGE | → "REQ-045.3, REQ-045.4, REQ-045.5: mention edited out, comment deleted, or recipient deactivated during the wait → dropped, no email" | Same shape: three recipients in one test, one sendAllDue, three sets of assertions |
| REQ-045.4: comment deleted during the wait → Sam gets nothing | MERGE | same as above | Same shape |
| REQ-045.5: Sam deactivated during the wait → no email | MERGE | same as above | Same shape |
| STD-6: a failed send is retried after 1, then 4, then 10 minutes | MERGE | → "STD-6, REQ-053: failed sends retry after 1, 4 and 10 minutes, then the delivery is failed, logged once without the address, its time recorded, and never sent" | All three tests run the same 4-failure loop. The schedule assertions fit inside the loop |
| STD-6: after the third retry fails the email is failed and logged; nothing more is sent | MERGE | same as above | Same loop |
| REQ-053: the worker records when a delivery failed, and not while it waits for a retry | MERGE | same as above | Same loop |
| §1.4: a delivery whose lease has expired is claimed again | MERGE | → "§1.4: a delivery with an expired lease is claimed; one leased by another pass isn't" | Two recipients, one pass. Lease semantics are kept |
| §1.4: a delivery leased by another pass isn't claimed | MERGE | same as above | Same |
| §1.4: on SIGTERM the worker finishes its current pass and exits | REMOVE | "§1.4: on SIGTERM the worker finishes the deliveries it claimed and claims no more", plus `onePass()` in the OPS-005 and metrics tests | An aborted signal still running one pass is already what `onePass()` relies on. The metrics test asserts `sent: 1` after it |

Note: REQ-045.1 here asserts the full combined email text, which the templates test already checks word for word. Keep the test for the ID, but its `text` assertion could shrink to `toHaveLength(1)` plus the subject.

### src/server/api-route.test.ts: 25 → 13

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| SEC-004.1: a cross-site form post to delete WEB-42 is rejected with 403 and the handler never runs | MERGE | → "SEC-004.1, SEC-004: cross-site writes, or writes with no Origin and no same-origin Sec-Fetch-Site, get 403 before the body is read and the handler never runs" | Four requests to the same `apiRoute`, all with the same assertions. Every request variant is kept |
| SEC-004: a write with no Origin and Sec-Fetch-Site cross-site is rejected with 403 | MERGE | same as above | Same |
| SEC-004: a write with neither Origin nor Sec-Fetch-Site is rejected with 403 | MERGE | same as above | Same |
| SEC-004: a cross-site write with an invalid body gets 403 | MERGE | same as above | Same assertions. Only the schema overload differs |
| SEC-004: a write whose Origin matches APP_URL reaches the handler | MERGE | → "SEC-004: same-origin writes (Origin or Sec-Fetch-Site) and cross-site GETs reach the handler" | Same shape, three requests |
| SEC-004: a write with no Origin but Sec-Fetch-Site same-origin reaches the handler | MERGE | same as above | Same |
| SEC-004: a cross-site GET is not blocked | MERGE | same as above | Same |
| an ApiError maps to its status and { error: { message, fields } } | MERGE | → "an ApiError maps to its status and body, with fields only when given" | Two throws, same assertions |
| an ApiError without fields has no fields key in the body | MERGE | same as above | Same |
| any other thrown error maps to 500 with a generic message | MERGE | → "SEC-007: any other error is a generic 500, logged at error level with the error class only" | Identical setup (a handler that throws TypeError) |
| SEC-007: a 500 is logged at error level with the error class only | MERGE | same as above | Same |
| SEC-007: each request writes one log line with method, path, status and duration | MERGE | → "SEC-007: each request writes one log line of exactly method, path, status, duration, time, with no query, body, headers or cookies" | Same call. The second test's exact-keys assertion already covers the first |
| SEC-007: the log line leaves out the query string, body, headers and cookies | MERGE | same as above | Same |
| SEC-007: a signed-in request's log line names the actor by username only | MERGE | → "SEC-007: a signed-in request's log names the actor by username only; a signed-out 401 has no actor" | Two calls, same log helper |
| SEC-007: a signed-out request's 401 log line has no actor | MERGE | same as above | Same |
| a body that isn't valid JSON gets 422 "Couldn't read the request." with no fields | MERGE | → "a body that isn't JSON, or isn't an object, gets 422 Couldn't read the request." | Same assertions. The second test already loops over bodies |
| a JSON body that isn't an object gets 422 "Couldn't read the request." | MERGE | same as above | Same |
| STD-3: a schema failure gets 422 with the first message for each failing field | MERGE | → "STD-3, SEC-007: a schema failure gets 422 with the first message per field, or a whole-body message with no fields, and is logged at info without the body" | The SEC-007 422 log test sends exactly the same request. The whole-body check is one more call |
| STD-3: a schema's whole-body check gets 422 with its message and no fields | MERGE | same as above | Same |
| SEC-007: a validation 422 is logged at info level without the body | MERGE | same as above | Same request as the STD-3 field test |

Kept: the SEC-007 database-query-values log test, REQ-052 (role read as stored now), "the handler receives the schema's output", STD-1 (signed out with an invalid body gets 401, which tests step order), and "a route without a schema can still read the body itself" (it guards the webhook route's raw-body read).

### src/server/notifications.test.ts: 19 → 13

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-043.2: Sam assigns WEB-42 to themselves → no email | MERGE | → "REQ-043.2, REQ-044.2: assigning or mentioning yourself notifies nobody" | Same rule (actor is the recipient) and the same assertion |
| REQ-044.2: Sam writes @sam in their own comment → no email | MERGE | same as above | Same |
| REQ-043: unassigning emails nobody | MERGE | → "REQ-043.3: reassigning Sam → Jo emails only Jo; then unassigning emails nobody" | Same pre-assigned setup, run in sequence |
| §2.6: a new batch gets one pending delivery per channel of the recipient | MERGE | → into "REQ-043.1" (add a `deliveriesFor(sam)` assertion) | Identical setup (Alex assigns Sam) |
| §2.6: a notification joining a batch adds no deliveries | MERGE | → into "REQ-045.1" (add `deliveriesFor(sam)` with length 1) | Identical setup (assign plus mention) |
| §2.6: a new member's notification channels are email | REMOVE | The merged §2.6 delivery assertion in REQ-043.1 (`channel: "email"`). The schema migration test also checks `['email']` | Tests a column default |
| §2.6: a member must keep at least one notification channel | REMOVE (owner's call) | none | Tests a CHECK constraint. Nothing in R1 writes `notification_channels`. Keep it if the owner wants DDL guarded |

Layering note: REQ-045.1 and REQ-045.8 also appear in worker.test.ts, but they assert different things: batching here, the sent email there. Keep both.

### src/server/email/templates.test.ts: 10 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| spec §9: the password reset email matches the spec word for word | MERGE | → "spec §9: the password reset and invitation emails match the spec word for word" | Both are pure templates. They could call the template directly instead of going through sendEmail/outbox |
| spec §9: the invitation email matches the spec word for word | MERGE | same as above | Same |
| spec §9: an assignment email matches the spec word for word | MERGE | → "spec §9: each single notification email (assignment; mention in issue description, issue comment, project description, project comment) matches word for word" | Five `toEqual` calls on one pure function with shared fixtures |
| spec §9: a mention in an issue description … | MERGE | same as above | Same |
| spec §9: a mention in an issue comment … | MERGE | same as above | Same |
| spec §9: a mention in a project description … | MERGE | same as above | Same |
| spec §9: a mention in a project comment … | MERGE | same as above | Same |
| spec §9: a combined issue email lists each item oldest first, separated by --- | MERGE | → "spec §9, REQ-045: combined emails list items oldest first separated by ---, are titled with the issue or project, and use the newest item's title" | Same function, three calls |
| spec §9: a combined project email is titled with the project | MERGE | same as above | Same |
| REQ-045: a combined subject uses the newest item's title | MERGE | same as above | Same |

### src/server/email/send.test.ts: 4 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| STD-6: the outbox can be made to fail on demand | REMOVE | Every 503 route test that sets `outbox.failing` (invitations REQ-001.7, resend REQ-001.7, password-reset-links STD-6) | Tests the test double |

### src/server/projects.test.ts: 10 → 5

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-013.4: a write to an archived project is refused with This project is archived | REMOVE | Route tests: projects/[key] "REQ-013.4: a description save to an archived project…", labels, issues, comments and position REQ-013.4 tests | Already covered end to end about eight times |
| STD-4: a write to a missing project is Not found | REMOVE | projects/[key] "STD-4: an unknown project key is Not found"; labels "STD-4: labels of an unknown project are Not found" | Route-covered |
| SEC-006.1: a member deleting a missing project gets 403, not 404 | MERGE | → "SEC-006.1: a member deleting WEB, or a missing project, gets 403 and WEB remains" | Same function and actor. The assertAdmin-before-lookup check is kept |
| STD-2: a member can't archive a project | MERGE | → "STD-2: a member can't rename or archive a project" | One domain function (`updateProject`), the same pattern as members.test STD-2. It still calls the function directly, so the rule is satisfied |
| REQ-052.2: Jo, no longer an admin, saving a rename … | REMOVE | members/[username] route "REQ-052.2: a member whose admin role was removed gets 403 on their next admin save"; api-route "REQ-052: the handler gets the member's role as stored now" | Here the domain gets a `member` object, which makes it identical to the STD-2 rename test. The "demoted since sign-in" part is tested at the route and in apiRoute |
| REQ-012: a member can still save a description through updateProject | REMOVE | projects/[key] "REQ-012.1: a member saves a description with a heading and a bullet list" | Route-covered |

Kept: the archive race test (concurrency), SEC-006.1 (merged), STD-2 create, and STD-2 rename+archive (merged).

### src/server/cleanup.test.ts: 9 → 6

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| DATA-004.1: a password reset link expired 31 days ago is no longer in the database | MERGE | → "DATA-004.1, DATA-004: reset links are deleted 30 days after expiring or being used" | Same table and helpers, one `deleteExpiredRows` call |
| DATA-004: password reset links are deleted 30 days after being used | MERGE | same as above | Same |
| DATA-004.2: a notification sent 10 days ago is still stored | MERGE | → "DATA-004.2, DATA-004: finished notifications are deleted 30 days after finishing; one sent 10 days ago and pending ones stay" | Same helper. It is one more fixture in the existing test |
| DATA-004: sign-in attempts are deleted 30 days after they're an hour old | MERGE | → "DATA-004: sign-in attempts and reset requests are deleted 30 days after their rate-limit window" | Identical shape |
| DATA-004: password reset requests are deleted 30 days after they're a day old | MERGE | same as above | Same |

Option if the owner wants to go further: `deleteExpiredRows` is one global sweep, so every retention fixture could go into a single test, with a second test for chunking. That would make 2 tests instead of 6.

### src/server/sessions.test.ts: 9 → 4 (absorbs tokens.test.ts)

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-006: last_active_at under an hour old isn't rewritten and no cookie is sent | MERGE | → "REQ-006.1, REQ-006: a session used within 30 days stays signed in and is renewed after an hour idle, not before" | Same member and helpers, two sessions |
| REQ-006: signing out ends the session on that browser only | REMOVE | sessions/current route "REQ-006: signing out ends the session on this browser only" | Same example at the route layer, which owns it |
| REQ-006.2: Sam returns after 31 days away and gets 401 | MERGE | → "REQ-006.2, REQ-007.4, REQ-006: an expired, deactivated, missing or unknown session gets 401; the deactivated member's row is kept" | All of them use `expectSignedOut`. Auth assertions are kept |
| REQ-006: a missing or unknown session cookie gets 401 | MERGE | same as above | Same |
| REQ-007.4: a deactivated member's session gets 401 | MERGE | same as above | The 401 is also route-covered (members/[username] and issues REQ-007.4). The merge keeps the "row kept" assertion |
| SEC-004: in production the cookie is __Host-session and Secure | MERGE | → "SEC-004: the session cookie is HttpOnly, SameSite=Lax, Path=/, 30 days; in production __Host- and Secure, and only that name is read" | Same function, so it can be one test |
| SEC-003: every session gets a fresh token and only its hash is stored | MERGE | → absorbs tokens.test "SEC-003.1" as "SEC-003, SEC-003.1: each session gets a fresh 32-byte token, only its hash is stored, and the stored hash doesn't work as a token" | Both test token creation and hashing. tokens.test inserts a session by hand to do what `createSession` does |

### src/server/tokens.test.ts: 1 → 0

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| SEC-003.1: a stored token hash doesn't work as a session | MERGE | → sessions.test SEC-003 (above) | Overlaps that test. Every assertion moves across. Security: keep the "hash can't be used as a token" check verbatim |

### src/server/seed-load.test.ts: 7 → 5

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| NFR-001: seeds around keys reserved by deleted projects | MERGE | → "NFR-001: seeds 50 projects, 10,000 issues and 50,000 comments around reserved keys" | Read-only queries over the same `beforeAll` seed |
| NFR-002: one member has 300 open assigned issues | MERGE | → "NFR-002: one board column holds 300 cards and one member has 300 open assigned issues" | Same |

### src/server/schema.test.ts: 5 → 4

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| §2.6: notifications.batch_id is required and email_id is gone | MERGE | → "the migration applies to an empty database" (same `dbName`, already migrated) | Column-shape assertion. It needs no separate database or migrate call |

Owner decision: the three §2.6 data-migration tests (move, leftover, backfill) guard migrations 0004 to 0008, which have already shipped. Migrations are immutable, so once every environment has run them these tests can never fail. They could then go, which would make 2 tests. Each also creates its own database, so they are the slowest tests in this set. I did not mark them REMOVE because deployment is outside the repo and I can't verify that every environment has run them. The table-list assertion in "applies to an empty database" is a "tables exist" check. The enum-order assertion is the valuable part, because enum order is the sort order.

### src/server/invitations.test.ts: 4 → 4 (1 with owner OK)

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| STD-2: a member can't list invitations | MERGE (needs owner OK, conflicts with rule) | → "STD-2: a member can't list, create, resend or revoke invitations, and nothing changes" | There are four admin-only functions, and the rule requires one 403 test each. The tests have the same shape. The route-level copies are the better cut (see the cross-cutting notes) |
| STD-2: a member can't invite | MERGE (owner OK) | same as above | |
| STD-2: a member can't resend an invitation | MERGE (owner OK) | same as above | |
| STD-2: a member can't revoke an invitation | MERGE (owner OK) | same as above | |

### src/server/setup.test.ts: 7 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-003.1: username "Sam" is saved as "sam" | MERGE | → "OPS-001.1, REQ-003.1: on a fresh install the admin is created with username lower-cased and can sign in" (pass `username: "Sam"`) | Same call |
| OPS-001: %o is refused with %s (4 `it.each` rows) | MERGE | → one "OPS-001: a blank name, a bad username or a short password is refused and nothing is saved" with four assertions | Shared setup. Each row is one assertion. The password rule is also covered by schemas/password.test |

### src/server/seed.test.ts: 4 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| seed: running twice adds no duplicates | MERGE | → "seed: creates 2 admins, 5 members (1 deactivated) and running it twice adds none" | Run seed twice, then make the count assertions |

### src/server/members.test.ts: 6 → 2

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-003.4: the initials of "%s" are "%s" (5 `it.each` rows) | MERGE | → one "REQ-003.4: initials of long, single, bracketed, numeric and CJK names" with five assertions | A pure function. It is five tests only because of `it.each` |

STD-2 (updateMember role/deactivate) is kept: it is required by the rule. The members/[username] route "STD-2: a member can't change roles or deactivate" repeats it.

### src/proxy.test.ts: 6 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| SEC-010.1: a page response forbids framing by other sites | REMOVE | "SEC-010.1: a page response carries the Content Security Policy" | That test's exact `toBe` already includes `frame-ancestors 'none'` |
| SEC-010.1: a page response sends no referrer to other sites | MERGE | → "SEC-010.1: a page response carries the CSP and Referrer-Policy: no-referrer" | Same response object |
| D-26: the nonce is forwarded to Next.js in the request's CSP header | MERGE | → "D-26: each request gets a fresh nonce, forwarded to Next.js in the request CSP header" | Same helper |

### src/instrumentation.test.ts: 4 → 2

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| the app starts when every variable is set | MERGE | → "the app starts with every variable set and refuses when one is missing or empty, naming them" | Run it once unstubbed, then stub. The same function is checked for both outcomes |
| the app refuses to start with a variable missing | MERGE | same as above | |
| the app refuses to start with an empty variable | MERGE | same as above | |

### src/repository.test.ts: 2 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| OPS-006.1: no env file with secrets is tracked | MERGE | → "OPS-006.1: no email API key or secret env file is tracked" | Same `git ls-files` list. This is a meta test, but it is the only test of OPS-006.1, so keep it |

### src/test/harness.test.ts: 3 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| a factory member's created_at moves back a day | REMOVE | sessions REQ-006.1 and REQ-006.2, the cleanup tests | Tests the test helper. Every `moveIntoPast` user would fail if it broke |
| factory members are distinct and can be overridden | REMOVE | Every test that creates two members | Tests the test helper |

Kept: "tests run against the separate test database". seed.test and setup.test run `truncate members cascade`, so this guard protects the developer's dev data.

### src/schemas/password.test.ts: 4 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-048.1, REQ-048.2, REQ-048.3, REQ-048 (code points) | MERGE (all 4) | → "REQ-048.1, REQ-048.2, REQ-048.3: 12 to 128 characters counted in code points" | A pure schema with nine one-line assertions. REQ-048.2 is also covered at the route (me/password, password-resets) |

### Kept unchanged

passwords.test.ts (2: REQ-048.4 is only tested here; SEC-008.1), labels.test.ts (1: concurrency), notification-stats.test.ts (1: required 403).

---

### Cross-cutting patterns

1. **`it.each` and one-assertion pure-function tests.** members initials, setup validation, password schema, templates, proxy and instrumentation together hold 29 tests that become 9 single tests with several assertions. This is the biggest cheap win, and there is no loss of coverage.
2. **Shared setup split into "before / after / and also records X".** In worker.test.ts the REQ-053 "records state_changed_at" tests repeat the sent, dropped and failed flows exactly; the STD-6 retry tests split one loop into three; the lease tests split one pass into two. api-route.test.ts splits each `apiRoute` call by assertion (log vs response, keys vs values). Merging these removes about 20 tests.
3. **Domain tests that replay route-covered examples.** These are projects REQ-013.4, STD-4, REQ-012 and REQ-052.2, and sessions sign-out. The route layer should own behaviour, and the domain layer should own only authorization, races and things the route can't reach.
4. **The 403 duplication is the other way round: the route copies are the redundant ones.** The domain 403s are rule-required. These route tests repeat them and are candidates for the route-file auditor:
   - projects/route "STD-2: a member can't create a project"
   - projects/[key] "STD-2: a member can't rename, archive or delete a project"
   - members/[username] "STD-2: a member can't change roles or deactivate"
   - invitations/route "STD-2: … 403 from list and invite"
   - invitations/[id] "STD-2: … can't revoke"
   - invitations/[id]/resend "STD-2: … can't resend"

   Also, `[...path]/route.test.ts` "SEC-004.1: cross-site DELETE of WEB-42" repeats api-route SEC-004.1. Keep the route-level "STD-3: a member's invalid body gets 422, and a valid one gets 403" because it tests step order. Keep notification-stats REQ-053.8 because the route test owns that spec ID.
5. **Tests of test infrastructure.** These are outbox "fail on demand", the factory and `moveIntoPast` harness tests, and the tokens test inserting sessions by hand. Remove them. They are exercised by every test that depends on them.
6. **Schema and DDL assertions.** These are the column default, the channel CHECK constraint, the `batch_id` NOT NULL check and the table list. Only the enum order earns its place. The shipped data-migration tests are an owner decision, with 2 more cuts available.
7. **Notification coverage across three layers.** This is mostly not duplication: notifications.test owns batching and rows, worker.test owns sending, dropping and retries, and templates owns wording. The real overlap is the worker REQ-045.1 full-text assertion, which repeats templates. Trim that assertion but keep the test.

---

# Part D

## Review D: src/client/screens tests

Scope: 16 screen test files. **Current 199 → proposed 120 (−79).**

Conventions used below:
- **REMOVE**: drop the test. The "Covered by" column says which test still covers it.
- **MERGE → X**: fold the test's assertions into test X, which is either a kept test or the first test in the merge group. The merged test's name lists every ID it covers.
- "Deferred answer": several STD-5 merges need a mock answer the test can resolve later. `src/test/client-app.tsx` has only `never()`, so add one small `deferred()` helper that returns `{ answer, resolve }`. NotificationStatus REQ-053.7 already does this inline with `hold`/`release`.

Shared code these decisions rely on:
- `LoadFailed`/`Loading` (`src/client/LoadStates.tsx`) is used by Board, List, MyIssues, ArchivedProjects, NotificationStatus, Issue and ProjectGate.
- `useShowLoading.test.tsx` covers the 300 ms timing.
- `DescriptionEditor` (`src/client/DescriptionEditor.tsx`) holds the save, Saving…, 422, 409, toast, Cancel and Escape logic. Issue and ProjectDetail both use it.
- `LeaveGuard` handles the unsaved-changes prompt.
- `TitleLink` (`src/client/IssueCells.tsx`) shows the truncation tooltip. List and MyIssues both use it.
- `returnTarget` is covered by `return-to.test.ts`.
- `moveIssue.onQueryStarted` in `api.ts` does the optimistic move and the rollback for both the menu and drag paths.
- Dialog focus and Escape, and Menu close/focus return, belong to `track-lite` Dialog/Pop.

---

### Issue.test.tsx: 32 → 17

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-016: pressing Enter in the title saves it | MERGE | → "REQ-016: Enter or leaving the title saves it; Escape restores the saved title" | Same render and same field. Run Escape (no save), then blur (no save), then Enter (save), then type and blur (save). |
| REQ-016: leaving the title saves it, and Escape restores… | MERGE | (same merged test) | See above. |
| REQ-016: a title over 200 characters gets Too long (max 200) | REMOVE | REQ-016.3 test (same `useIssueSave` 422 branch); server `issues/[id]/route.test.ts` | Tests a second server message on the same branch. |
| REQ-017: the Status picker lists every status… checked | MERGE | → REQ-017.1 ("REQ-017, REQ-017.1: …lists statuses in order with current checked; Backlog → Done saves") | One render. Open the picker, check the order and the checked status, then pick Done. Seed with status backlog and check that Backlog is the checked one. |
| REQ-019.2: clearing the assignee shows Unassigned | MERGE | → REQ-019.1 ("REQ-019.1, REQ-019.2, REQ-019: …assign Alex, filter by name/username, then clear") | One render. Assign Alex, reopen the picker, type to check the filter, then choose Unassigned. |
| REQ-019: typing in the assignee search filters… | MERGE | → REQ-019.1 merged test | Same picker in the same render. |
| REQ-019: assigning someone who isn't an active member shows Choose an active member | REMOVE | Server `issues/[id]/route.test.ts` "REQ-019: an unknown assignee…". REQ-020.3 covers showing a field error under a picker. | Re-tests a server rule. The UI branch is the generic `useIssueSave` fieldError. |
| REQ-023: the delete confirmation focuses Cancel, which closes it without deleting | MERGE | → REQ-023.1 ("REQ-023, REQ-023.1: Cancel closes without deleting; confirming deletes and lands on the board") | One render. Open, Cancel, reopen, confirm. Drop the focus assertion, because Dialog.test "moves focus to the first control" covers it. |
| STD-9: a failed label save shows the toast and keeps the old labels | REMOVE | REQ-020.4 (same `useIssueSave` toast branch; also checks that old labels are kept) | Duplicate of a branch; STD-9 is still covered by the picker STD-9 test. |
| REQ-022.2: a description of 20,001 characters… | REMOVE | ProjectDetail REQ-012.2 test, renamed "REQ-012.2, REQ-022.2, …" | `DescriptionEditor` 422 branch, tested twice. |
| STD-8: a stale description save… | REMOVE | ProjectDetail STD-8 (merged into REQ-012.2) | `DescriptionEditor` 409 branch, tested twice. |
| STD-5: Save is disabled while the description saves | REMOVE | ProjectDetail STD-5 (merged into REQ-012.1) | `DescriptionEditor` Saving… state, tested twice. |
| REQ-022: Cancel or Escape discards the description draft | MERGE | → ProjectDetail "Cancel discards the draft…" (renamed "REQ-022: Cancel or Escape discards the description draft") | `DescriptionEditor` `onDone`. Add the Escape step to the ProjectDetail test. |
| REQ-013: an issue in an archived project is read-only | MERGE | → "REQ-013: an archived issue is read-only: title, pickers, labels, description and Delete" | Same mock in all three tests. |
| REQ-013: an archived issue shows its labels read-only | MERGE | (same merged test) | Same setup. |
| REQ-013: an archived issue's description has no Edit button | MERGE | (same merged test) | Same setup. |
| REQ-020: unchecking a label in the picker removes it | MERGE | → REQ-020.1 ("REQ-020.1, REQ-020: adding bug and frontend saves each; unchecking frontend removes it") | Same picker, one more step. |

### Members.test.tsx: 20 → 13

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-051: deactivated members stay listed, marked "(deactivated)" | MERGE | → REQ-051.1 | Same default render (Jo is already in it). |
| STD-5: Send invitation is disabled while sending | MERGE | → REQ-001.1 (deferred answer) | Check Sending…, resolve, then check the Pending row. |
| REQ-001.2: an existing member's email is refused beside the field | MERGE | → "REQ-001, REQ-001.2, REQ-001.6: a refused email shows beside the field and keeps the text" | Same branch (`fields?.email ?? message`). Use queued answers: one with field errors, then one message-only 422. The server tests own the copy for each refusal. |
| REQ-001.6: a deactivated member's email is refused beside the field | MERGE | (same merged test) | Same branch as REQ-001.2. |
| Revoke asks for confirmation; Cancel sends nothing | MERGE | → REQ-001.4 ("REQ-001.4: Revoke asks first; Cancel sends nothing; confirming removes the row") | One render: Cancel, then confirm. |
| REQ-007: Deactivate asks …; Cancel sends nothing | MERGE | → "REQ-007: confirming Deactivate…" (renamed to cover both) | One render: Cancel, then confirm. |
| the ⋯ menu closes on Escape and returns focus to ⋯ | REMOVE | Pop.test (react-aria Menu); Shell.test "member menu closes on Escape…" | This is design-system behaviour, not screen behaviour. |

Kept: REQ-051.2, REQ-051.3, REQ-001.7 (toast branch), REQ-008, REQ-052, REQ-007.3 (the only test of the member-action toast branch), and both STD-7 tests. Members renders its own "Couldn't load this." markup and does not use `LoadFailed`.

### Board.test.tsx: 19 → 13

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-025.1: WEB-42 with 5 labels shows… | MERGE | → REQ-024.1 ("REQ-024.1, REQ-025.1, REQ-025.2: columns in order with counts; card shows…; unassigned/no-priority card shows neither") | All three use the same default render. |
| REQ-025.2: an unassigned card with No priority… | MERGE | (same merged test) | Same render. |
| the ⋯ menu disables Move to bottom on a column's last card | MERGE | → "the ⋯ menu lists every status… disables Move to top on the first card" (also open the WEB-12 menu) | Same first/last logic and same render. |
| REQ-026.2: a failed move from the menu shows Couldn't move WEB-42… | REMOVE | REQ-026.2 drag-failure test | The rollback and toast live in `moveIssue.onQueryStarted`, which the menu and drag share. The menu wiring is already covered by REQ-030.1/030.2. |
| dropping a card into an empty column saves place top | MERGE | → "dropping a card between two cards…saves {after}, first saves top" (add a third drag into Canceled) | Same place-calculation logic, one render. |
| STD-7: a board that fails to load shows Couldn't load this. with Retry | REMOVE | MyIssues STD-7 load-failure test (the one kept `LoadFailed` test) | Shared `LoadFailed`; the only screen code is `onRetry={refetch}`. STD-7 is still covered by the empty-columns test. |

Kept: REQ-029.1, REQ-030.1, REQ-030.2, REQ-026.1, NFR-005 (optimistic move), REQ-026.2 drag, REQ-026.4, REQ-026.5, STD-7 empty columns, REQ-024.2.

### Labels.test.tsx: 15 → 11

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| STD-5: Create label is disabled while saving | MERGE | → "REQ-021: creating a label…" (deferred answer) | Same form and flow. |
| REQ-021: an unknown colour shows "Choose a color" under Color | MERGE | → REQ-021.2 ("REQ-021, REQ-021.2: create field errors show under Name and Color and keep what was typed") | Same `fieldErrors` branch. Have one 422 return `{ name, color }` and assert both, the same way the server route test does. |
| REQ-021.5: cancelling the confirmation keeps the label | MERGE | → "REQ-021.5: deleting asks with the issue count…" | One render: Cancel, then confirm. Drop the Cancel-focus check (Dialog.test covers it). |
| STD-9: a label deleted meanwhile shows "That label no longer exists" and reloads | MERGE | → REQ-013.6 ("REQ-013.6, STD-9: a refused rename shows the server's message as a toast, keeps the typed name; a 404 reloads the list") | Same RenameForm toast branch. Queue a 403 answer, then a 404. The server `labels/[id]/route.test.ts` owns both rules. |

Kept: REQ-021 list, STD-7 empty, STD-7 load failure (own markup), REQ-021.1, STD-3 rename, recolour, REQ-013.5.

### List.test.tsx: 14 → 11

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-040.3: an unknown status in a link is ignored | MERGE | → REQ-040.2 ("REQ-040.2, REQ-040.3: a deleted label and an unknown status in a link are ignored; Done still applies"), URL `?label=frontend&status=done&status=Todo` | The same URL parsing handles both. |
| List — default: the columns, and each row's cells | MERGE | → REQ-039 ("REQ-039: default columns and cells; newest-updated first; sort directions") | Same default render; check the cells before clicking sort. |
| List — load failure: Couldn't load this. and Retry loads again | REMOVE | MyIssues STD-7 load-failure test | Shared `LoadFailed`. |

Rename REQ-036.4 to "REQ-036.4, REQ-042.3: …" because it becomes the single test of the `TitleLink` tooltip (see MyIssues).

### AcceptInvitation.test.tsx: 13 → 7

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-002.4: a revoked invitation on submit shows … and no form | MERGE | → "REQ-002.2, REQ-002.4: a 410 on submit replaces the form with the server's message" | Same branch (`status === 410` → message). Delete the REQ-002.2-on-submit test and keep the revoked copy. The server `members/route.test.ts` owns both messages. |
| REQ-002.2: a 410 expired answer on submit replaces the form… | MERGE | (same merged test) | See above. |
| REQ-002.3: after Sign out, the same link shows the form | MERGE | → REQ-002.3 signed-in test (continue with "click Sign out" and check the form) | Same scenario, one render. |
| REQ-003.2: a taken username shows "Username taken" beside Username | MERGE | → STD-3 field-errors test (use "Username taken" as the username error) | Same `fields` branch; the server `members/route.test.ts` covers REQ-003.2. |
| STD-5: Join Tracklite is disabled while saving | MERGE | → REQ-002.1 (deferred answer) | Same flow. |
| STD-7: "Checking your invitation…" shows only after 300 ms | REMOVE | `useShowLoading.test.tsx` | Tests the shared timing hook; the only screen-specific part is static copy. |
| §4.2: the invitation page removes the token from the address | MERGE | → REQ-002.1 (add `expect(search has token).toBe(false)`) | Same flow and requests as REQ-002.1. |

### ProjectDetail.test.tsx: 13 → 8

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| STD-5: Save is disabled while the description saves | MERGE | → REQ-012.1 (deferred answer) | Same flow. After the merge this is the single `DescriptionEditor` STD-5 test. |
| STD-8: a conflicting save shows the server message in the editor | MERGE | → REQ-012.2 ("REQ-012.2, REQ-022.2, STD-8, STD-9: a refused save shows the field error, the conflict in the editor, or a toast, and always keeps the text") | The three `DescriptionEditor` failure branches. One render with queued answers 422, 409, 500. |
| STD-9: a failed save shows a toast and keeps the editor open | MERGE | (same merged test) | See above. |
| REQ-035.4: closing the tab with unsaved changes asks the browser | MERGE | → REQ-035.3 (dispatch `beforeunload` before and after typing, then click away) | `LeaveGuard` on the same render. |
| REQ-012.3: HTML in a description is shown as text | REMOVE | `Markdown.test.tsx` "REQ-012.3: <script>… shown as text"; server `projects/[key]/route.test.ts` REQ-012.3 | Markdown rendering is already tested in its own unit test. |

Rename "Cancel discards the draft…" to "REQ-022: Cancel or Escape discards the description draft" and add the Escape step from Issue.

### NotificationStatus.test.tsx: 11 → 4

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-053.2: Email row shows 12 sent… | MERGE | → "REQ-053.1–053.4, STD-2: worker, queue, Email counts, problem rows newest first, Notifications link current" | All render the default stats. Seed 20 problems and check the first row's cells and the order. |
| REQ-053.3: failed row shows sam, Email, WEB-42, 4 and when | MERGE | (same) | Same render. |
| REQ-053.4: 20 most recent problems listed newest first | MERGE | (same) | Same render once it is seeded with 20. |
| STD-2: admins get the Notifications link, current on its page | MERGE | (same) | Same render. |
| REQ-053.6: no problems shows "No failed or bounced notifications." | MERGE | → REQ-053.5 ("REQ-053.5, REQ-053.6, REQ-053.9: never-run worker shows Never, nothing due shows None, no problems shows the empty message") | One render of `stats({ workerLastPassAt: null, queue: {due: 0…}, recentProblems: [] })`. |
| REQ-053.9: nothing due shows "None" | MERGE | (same) | Same. |
| STD-7: a load failure shows "Couldn't load this." with Retry | REMOVE | MyIssues STD-7 load-failure test | Shared `LoadFailed`. |

Kept: REQ-053.7 (refresh-only logic) and REQ-053.8.

### Profile.test.tsx: 11 → 7

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-003.3: Save sends only the full name and confirms with "Name saved." | MERGE | → "REQ-003.3: full name is editable; username/email read-only; Save sends only the name, confirms, and the confirmation clears on the next edit" | Same render and form. |
| "Name saved." clears once the full name is edited again | MERGE | (same) | Continuation of the same flow. |
| REQ-048: a new-password field error from the server shows beside New password | MERGE | → REQ-049.2 ("REQ-049.2, REQ-048: server field errors show beside Current/New password and keep what was typed"), one 422 with `{ currentPassword, newPassword }` | Same `failure.fields` branch. |
| STD-9.3: a failed password change shows the toast and keeps both fields | MERGE | → STD-9.3 failed name save ("STD-9.3: a failed name save or password change shows the toast and keeps what was typed") | Both are the generic toast path in one render. `api.test.ts` owns the copy. |

Kept: REQ-003 name field error, STD-5 (tests that the two forms are independent, which is real logic), REQ-049.1, and REQ-049.3 (429 inline, not a toast).

### MyIssues.test.tsx: 9 → 3

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-041.5: 300 issues are all on the page from one request | REMOVE | Server `my-issues/route.test.ts` REQ-041.5 | The client has no paging code, so this only checks that the screen renders what it receives. |
| REQ-042.1: …API-9 comes first | REMOVE | Server `my-issues/route.test.ts` REQ-042.1; REQ-041.1 already checks that rows render in server order | Sorting happens on the server; this re-tests a server rule. |
| REQ-042.2: clicking WEB-42 opens the issue | MERGE | → REQ-041.1 ("REQ-041.1, REQ-042, REQ-042.2: groups…; a row shows…; clicking opens the issue") | Same default data once labels are added. |
| REQ-042: a row shows ID, title, project name… | MERGE | → REQ-041.1 (same) | Same render. |
| REQ-042.3: a title cut off with "…" shows in full on hover | REMOVE | List REQ-036.4, renamed "REQ-036.4, REQ-042.3" | Shared `TitleLink`; the List test is a superset (hover, focus, short titles). |
| STD-7: "Loading…" appears only after 300 ms | REMOVE | `useShowLoading.test.tsx` | Shared hook. |

Kept: REQ-041.4 and STD-7 load failure. MyIssues becomes the one representative screen test of `LoadFailed`. It could also move into a new `LoadStates.test.tsx`, which would be a net-zero change.

### ProjectSettings.test.tsx: 9 → 5

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| REQ-013.3: unarchiving puts the project back in the sidebar | MERGE | → REQ-013.1 ("REQ-013.1, REQ-013.3, REQ-013.7: archiving removes it from the sidebar and shows the name read-only with no Save; unarchiving restores it") | One render with a round trip. |
| REQ-013.7: an archived project's settings show the name with no Save | MERGE | (same, asserted after archiving) | Same component state. |
| REQ-014.2: a key that doesn't match exactly keeps Delete disabled… | MERGE | → REQ-014.1 ("REQ-014.1, REQ-014.2: Delete stays disabled until the key matches exactly, then deletes and goes to My issues") | One dialog: try WEBB, then web, then WEB. Drop the Cancel-focus check (Dialog.test covers it). |

Kept: REQ-011.1, STD-3, STD-9, STD-2.

### ResetPassword.test.tsx: 9 → 5

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| STD-7: "Checking your link…" shows only after 300 ms | REMOVE | `useShowLoading.test.tsx` | Shared hook. |
| REQ-050.8: after Sign out, the same valid link shows the form | MERGE | → REQ-050.8 signed-in test (continue with Sign out) | One scenario. |
| §4.2: the reset page removes the token from the address | MERGE | → REQ-050.3 (add the token-gone assertion) | Same flow and requests. |
| REQ-048: "At least 12 characters" and "Too long (max 128)"… | KEEP (trim) | — | Same test count, but drop the second submit: the second server message runs the same branch. |

### SignIn.test.tsx: 9 → 5

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| SEC-001.1: a 429 shows "Too many attempts…" beside the form | MERGE | → REQ-047.2 ("REQ-047.2, SEC-001.1: a 422 or 429 shows the server's message in the form…") | Same branch (`422 \|\| 429`). Queue two answers. |
| SEC-009.1: next=https://evil.example or //evil.example lands on My issues | REMOVE | `return-to.test.ts` SEC-009.1 (also covers `/\evil.example`); REQ-047.5 shows the screen uses `returnTarget` | A pure-function rule tested again through the UI. |
| STD-5: while signing in, the button is disabled… | MERGE | → REQ-047.1 (deferred answer) | Same flow. |
| Sign in: Forgot password? links to /forgot-password | MERGE | → REQ-047.1 (one href assertion before signing in) | Trivial; same render. |

Kept: REQ-047.5, STD-9.3, §6.1.

### Project.test.tsx: 7 → 5

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| marks List as the current view on the list address | REMOVE | "API-004: /project/web/list?status=done…", which already checks that List is `aria-current` (also ProjectDetail REQ-046.1 for Details) | Duplicate assertion. |
| REQ-013.1: an archived project's header shows the Archived badge | MERGE | → STD-2 member test ("STD-2, REQ-013.1: a member sees no settings gear; an archived project shows Archived"), rendered as alex on OLD | Same header and one render. |

### ForgotPassword.test.tsx: 5 → 4

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| STD-5: while sending, the button is disabled and reads "Sending…" | MERGE | → REQ-050.1 (deferred answer) | Same flow. |

### ArchivedProjects.test.tsx: 3 → 2

| Test | Action | Merge target / covering test | Reason |
|---|---|---|---|
| STD-7: a load failure shows "Couldn't load this." with Retry | REMOVE | MyIssues STD-7 load-failure test | Shared `LoadFailed`. |

---

### Totals

| File | Current | Proposed |
|---|---|---|
| Issue | 32 | 17 |
| Members | 20 | 13 |
| Board | 19 | 13 |
| Labels | 15 | 11 |
| List | 14 | 11 |
| AcceptInvitation | 13 | 7 |
| ProjectDetail | 13 | 8 |
| NotificationStatus | 11 | 4 |
| Profile | 11 | 7 |
| MyIssues | 9 | 3 |
| ProjectSettings | 9 | 5 |
| ResetPassword | 9 | 5 |
| SignIn | 9 | 5 |
| Project | 7 | 5 |
| ForgotPassword | 5 | 4 |
| ArchivedProjects | 3 | 2 |
| **Total** | **199** | **120** |

### Cross-cutting patterns

1. **Shared components tested again on every screen.**
   - The `LoadFailed` + Retry test appears in 5 screens. Keep one.
   - The `useShowLoading` 300 ms test appears in 3 screens. Keep none, because `useShowLoading.test` covers it.
   - `DescriptionEditor` behaviour is tested in both Issue and ProjectDetail. Keep one copy.
   - The `TitleLink` tooltip is tested in both List and MyIssues. Keep one.
   - Rule: test a shared component once, in its own unit test or in one representative screen.
2. **Each server message tested separately on the same client branch.** The screen code is usually `422 → fields ?? message` and `else → toast`, yet tests repeat one per server rule (REQ-001.2/001.6, REQ-016 too-long, REQ-019 active member, REQ-003.2, REQ-002.2/002.4, SEC-001.1, REQ-048 double submit). The server route tests own the copy, so a screen needs one test per *branch*, not one per *message*.
3. **STD-5 "disabled while saving" as its own test.** Fold it into the happy-path test with a deferred answer: assert the Saving… state, resolve, then assert the outcome. This needs one `deferred()` helper in `src/test/client-app.tsx`.
4. **Cancel and confirm split into two tests.** Revoke, Deactivate, Delete issue, Delete label, Delete project and Archive/Unarchive each have separate tests for Cancel and for confirm. One render can do Cancel, reopen, confirm. Also drop the "Cancel is focused" assertions, which Dialog.test already covers.
5. **One test per visible part of the same default render.** Board cards, NotificationStatus facts, MyIssues rows, List cells, the archived read-only views on Issue, and Members rows should each be one render with several assertions.
6. **Client re-tests of server or pure-function rules.** SEC-009 (`return-to.test`), REQ-041.5 and REQ-042.1 (server sort and paging), REQ-012.3 (`Markdown.test`).
7. **Design-system behaviour.** Menu Escape/focus return (Members) and Dialog initial focus are tested in Pop.test and Dialog.test.
8. **Follow-up, not counted above:** Labels, Members, AcceptInvitation and ResetPassword render their own "Couldn't load this." markup instead of `LoadFailed`. If they switched to `LoadFailed`, their STD-7 load-failure tests could go too (about 4 more).

---

# Part E

## Review E: client components, design system, markdown

Scope: 24 files, **139 tests now, 68 proposed (-71)**.

Method: every test was read. Overlap was checked against `src/client/screens/*.test.tsx`. Screen tests use `renderAppAt` from `src/test/client-app.tsx`, which renders the real `<ClientApp />`, so they exercise the real design-system components too. Only tests that are not KEEP are listed below.

| File | Now | Proposed |
|---|---|---|
| src/client/CommentThread.test.tsx | 27 | 20 |
| src/client/Shell.test.tsx | 11 | 8 |
| src/client/DescriptionEditor.test.tsx | 7 | 4 |
| src/client/NewIssueDialog.test.tsx | 6 | 3 |
| src/client/ClientApp.test.tsx | 5 | 2 |
| src/client/Toaster.test.tsx | 2 | 1 |
| src/client/useShowLoading.test.tsx | 3 | 1 |
| src/client/api.test.ts | 8 | 6 |
| src/client/dates.test.ts | 4 | 3 |
| src/client/return-to.test.ts | 2 | 1 |
| track-lite/Pop.test.tsx | 11 | 0 |
| track-lite/CommandMenu.test.tsx | 8 | 3 |
| track-lite/Dialog.test.tsx | 6 | 3 |
| track-lite/Field.test.tsx | 5 | 1 |
| track-lite/Pill.test.tsx | 4 | 1 |
| track-lite/AppShell.test.tsx | 3 | 1 |
| track-lite/Segmented.test.tsx | 3 | 1 |
| track-lite/Status.test.tsx | 3 | 1 |
| track-lite/ListRow.test.tsx | 2 | 1 |
| track-lite/Table.test.tsx | 2 | 0 |
| track-lite/IssueLayout.test.tsx | 2 | 0 |
| track-lite/Button.test.tsx | 1 | 0 |
| src/lib/markdown/Markdown.test.tsx | 8 | 4 |
| src/lib/markdown/parse.test.ts | 6 | 3 |
| **Total** | **139** | **68** |

---

### src/client/CommentThread.test.tsx: 27 → 20

There is no comment coverage in the screen tests (`Issue.test.tsx` and `ProjectDetail.test.tsx` have none), so this file is the only coverage for the thread. The cuts are all merges of tests that share the same setup.

| Test | Action | Merge target | Reason |
|---|---|---|---|
| REQ-033: a too-long edit shows the error under the editor and keeps the text | MERGE | → "REQ-033, REQ-033.3, STD-8: a failed edit save shows the server's message under the editor and keeps the text" | All three use the same setup (Sam's own comment, `editTo`). Use one `patch` mock that answers 422 (field), then 409, then 404. Click Save three times and assert the message and the kept text each time. |
| REQ-033.3: saving an edit to a deleted comment shows "This comment was deleted"… | MERGE | same as above | Same path: the server message is shown in the editor. |
| STD-8: a conflicting edit shows the server message in the editor | MERGE | same as above | Same as above. |
| STD-5: Post is disabled and reads "Posting…" while posting | MERGE | → "STD-5, STD-9: a failed post keeps the text; the retry reuses the requestId and shows Posting… disabled" | The `post` mock answers `networkError` first and `never` second. After the retry, assert "Posting…" is disabled and the requestId matches. |
| STD-9: a failed post shows "Couldn't save. Try again." and keeps the text | MERGE | same as above | Shared flow. |
| REQ-033.2: an admin sees Delete but not Edit on someone else's comment | MERGE | → "REQ-033.2, REQ-034.2, REQ-034.4: an admin can delete but not edit others' comments, including a deactivated author's" | Same `me: admin` setup. Seed one comment by Alex and one by deactivated Sam. Assert the menu shows no Edit, the "(deactivated)" label is shown, and both deletes go through. |
| REQ-034.2: an admin deletes Alex's comment | MERGE | same as above | Same as above. |
| REQ-034.4: a deactivated author shows "Sam Lee (deactivated)" and an admin can still delete | MERGE | same as above | The delete half repeats REQ-034.2. |
| REQ-035.2: an empty comment box leaves without asking | MERGE | → "REQ-035.2, REQ-035: a posted comment or a blank box doesn't hold back leaving" | Type and post, then type "   " and click My issues: no prompt. This covers both cases in one navigation. |
| REQ-035: a posted comment no longer holds back leaving | MERGE | same as above | Same as above. |
| REQ-031: hovering a comment's time shows the exact date and time | MERGE | → "REQ-031, REQ-033: hovering the time or "(edited)" shows the exact time" | Use one comment with both `createdAt` and `editedAt` and make two `title` assertions. |
| REQ-033: hovering "(edited)" shows the edit time | MERGE | same as above | Same as above. |

### src/client/Shell.test.tsx: 11 → 8

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-009.4: a key that isn't 2 to 5 letters shows the server's field error | MERGE | → "REQ-009.3, REQ-009.4: server field errors show beside their fields and keep what was typed" | The 2-to-5-letter rule lives on the server. In the client it is just another 422 field message, which REQ-009.3 already shows beside its field while keeping the text. Swap one of REQ-009.3's messages for "Key must be 2 to 5 letters". |
| design §6.2: the bottom of the sidebar shows the signed-in member's initials and name | MERGE | → "design §6.2: the member button shows initials and name, and Profile goes to /settings/profile" | The Profile test already opens the same trigger. Add the `textContent` and `aria-haspopup` assertions there. |
| design §6.2: the member menu closes on Escape and returns focus to its button | REMOVE | react-aria `Menu` | This is react-aria's own Escape and focus-restore behaviour. We don't configure it. |

### src/client/DescriptionEditor.test.tsx: 7 → 4

| Test | Action | Merge target | Reason |
|---|---|---|---|
| DATA-001: typing after @ filters the suggestions by username or name | MERGE | → "DATA-001, DATA-001.5: @ suggests active members, filtered by username or name, says No results, and ignores an @ inside a word" | Same setup (open the editor, call `type`). It becomes a sequence of `type` calls with an assertion after each. |
| DATA-001: a query that matches no one shows No results | MERGE | same as above | Same as above. |
| DATA-001.5: an @ inside a word doesn't open the suggestions | MERGE | same as above | Same as above. Note that parse.test DATA-001.5 covers the server-side parser, not the suggestion trigger, so both are needed. |

Kept: insert on Enter or click, arrow keys, and Escape ordering. This is real interaction logic in `useMentions`.

### src/client/NewIssueDialog.test.tsx: 6 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| STD-5: Create is disabled while the issue is saving | MERGE | → "STD-5, STD-9: a failed create shows the toast and keeps the title; the retry reuses the requestId and shows Creating… disabled" | The `post` mock answers `networkError`, then `never`. Navigation after a successful create is already asserted by REQ-016.1. |
| STD-5: retrying after a failed create sends the same requestId | MERGE | same as above | Same flow. |
| STD-9: a server error shows the toast and keeps the title | MERGE | same as above | A 500 and a network error produce the same toast (api.test STD-9.3 already pins this). Assert the kept title and the unchanged path before the retry. |
| REQ-013: an archived project's header has no New issue | REMOVE | `screens/List.test.tsx` "REQ-036.3: an archived project's list has no New issue…" and `screens/Board.test.tsx` REQ-024.2 | The same project header and the same assertion, already made at screen level. |

### src/client/ClientApp.test.tsx: 5 → 2

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| M0.4: any page address loads the app shell | REMOVE | Every screen test: `renderAppAt` renders `<ClientApp />` at /my-issues, /project/WEB/list, and so on (for example Shell REQ-015.3, List REQ-040.1) | Implicitly covered hundreds of times. |
| STD-4: an unknown address shows Not found with a link to My issues | MERGE | → "M0.4, STD-4: an unknown address shows Not found; its My issues link navigates without a reload" | The no-reload test already starts at /nope and finds the same link. Add the heading and `href` assertions. |
| STD-1: with no session the shell lands on sign-in | REMOVE | `api.test.ts` "STD-1: a 401 from any request redirects to /sign-in?next={current address}" | The redirect is done by the shared `baseQuery`. The api test pins the exact `next` value, including a query string. |

### src/client/Toaster.test.tsx: 2 → 1

| Test | Action | Merge target | Reason |
|---|---|---|---|
| STD-9.2: a new toast replaces the current one | MERGE | → "STD-9.1, STD-9.2: one toast at a time; a new one replaces it and each disappears after 5 seconds" | The same store and timers. Show, advance 3 s, show again, then assert one toast, gone at exactly 5 s after the second, with no button. |

### src/client/useShowLoading.test.tsx: 3 → 1

| Test | Action | Merge target | Reason |
|---|---|---|---|
| STD-7: a request that finishes within 300 ms never shows the loading indicator | MERGE | → "STD-7: the loading indicator shows only after 300 ms pending and hides when the request finishes" | One `renderHook` with rerenders: true → 299 ms false → 300 ms true → false → false; then true → 200 ms → false → +500 ms false. Also covered at screen level by MyIssues "STD-7: Loading… appears only after 300 ms". |
| STD-7: the loading indicator hides once the request finishes | MERGE | same as above | Same as above. |

### src/client/api.test.ts: 8 → 6

| Test | Action | Merge target | Reason |
|---|---|---|---|
| STD-6: a 503 keeps the server's message | MERGE | → "STD-9.3, STD-6: any other failure (403, 503) shows the server's message" | It is the same `baseQuery` branch with a different status. Add a second `respondWith(503…)` call. |
| baseQuery sends a JSON body with the method and returns null for a 204 | MERGE | → "baseQuery: GET returns parsed JSON; POST sends a JSON body and a 204 gives null" | Two plumbing tests with no spec ID and the same helper. Make two dispatches in one test. |

### src/client/dates.test.ts: 4 → 3

| Test | Action | Merge target | Reason |
|---|---|---|---|
| REQ-031.4: a date after 7 days, with the year only when it isn't this year | MERGE | → "formatUpdated, REQ-031.4: relative within 7 days, then a date with the year only when it isn't this year" | The same function and fixture. Add two more `expect` lines. |

### src/client/return-to.test.ts: 2 → 1

| Test | Action | Merge target | Reason |
|---|---|---|---|
| SEC-009: a path in this app is kept; a missing next returns to /my-issues | MERGE | → "SEC-009, SEC-009.1: only an in-app path is kept; external, protocol-relative, backslash and missing next go to /my-issues" | A pure function with the same import. This is security-relevant, so the merge keeps every assertion. It is optional: leaving it as 2 costs nothing. |

---

### track-lite/Pop.test.tsx: 11 → 0

Every Pop export that the app uses is exercised end-to-end by screen tests, with the same roles and assertions. `PopItem`'s `selected` and `disabled` props are not used anywhere in the app. `MentionList` uses `PopItem` only with neither prop.

| Test | Action | Covered by | Reason |
|---|---|---|---|
| marks a selected item with a check | REMOVE | (prop not used in the app) | Trivial rendering of an unused prop. |
| ignores presses on a disabled item | REMOVE | (native `<button disabled>`) | Browser behaviour, and the prop is unused. |
| Menu with a text trigger shows the text and checks the selected item | REMOVE | `screens/Labels.test.tsx` "Change color of frontend": the menuitemradio is checked and clicking Blue calls the action | Same component, same assertions. |
| MenuSubmenu opens its items, checks the current one… | REMOVE | `screens/Board.test.tsx` REQ-030.1, and "the ⋯ menu lists every status, checks and disables the current one…" | The submenu, check and disabled state are covered there. The submenu opening itself is react-aria behaviour. |
| Picker shows its value on the Pick and opens a listbox with a check on the current item | REMOVE | `screens/Issue.test.tsx` "REQ-017: the Status picker lists every status in order with the current one checked" | |
| Picker calls onChange with the chosen key | REMOVE | Issue REQ-017.1, REQ-018.1, REQ-019.1 | |
| Picker with search filters the items as you type | REMOVE | Issue "REQ-019: typing in the assignee search filters members…, keeping Unassigned" | |
| MultiPicker checks every selected item and reports each toggle without closing | REMOVE | Issue REQ-020.1 (clicks bug, then frontend, without reopening, which proves the picker stays open) and REQ-020 (uncheck, `aria-selected`) | |
| MultiPicker shows a create row for the typed text… | REMOVE | Issue REQ-020.2 (clicks "Create label “Design”") | |
| MentionList marks the active member and reports a chosen one | REMOVE | DescriptionEditor "arrow keys move the highlighted suggestion" (`aria-selected` and `aria-activedescendant`) and "Enter or a click … inserts @username" | |
| MentionList shows its empty message when no member matches | REMOVE | DescriptionEditor "a query that matches no one shows No results" (the same `status` text) | |

### track-lite/CommandMenu.test.tsx: 8 → 3

`CommandMenu` is not used by any app code; it is only exported from `index.ts`. `FilterPicker` is used by `screens/List.tsx`.

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| filters commands by the typed text, ignoring case | MERGE | → "CommandMenu: filters ignoring case, says when nothing matches, runs the highlighted command on Enter and closes on Escape" | All four use the same inline render with the same commands. This is the component's own logic, kept as one test because nothing in the app uses it yet. |
| says when nothing matches | MERGE | same as above | Same as above. |
| runs the highlighted command on Enter and closes | MERGE | same as above | Same as above. |
| closes on Escape | MERGE | same as above | Same as above. |
| closes on a press outside the panel but not inside it | MERGE | → "CommandMenu overlay: focuses the search box and closes on a press outside the panel only" | Same overlay render. |
| focuses the search box when opened as an overlay | MERGE | same as above | Same as above. |
| a filter is a button while empty and opens a multi-select list, marked open | REMOVE | `screens/List.test.tsx` REQ-040.2 and REQ-040.3 (`tl-filter-add` while empty), and every `openFilter` call | `aria-expanded` and `aria-multiselectable` come from react-aria. |

Kept: "with values it becomes a rule reading "is" or "is any of", and × clears it". The per-filter "Clear status filter" × button is not clicked in any List screen test.

### track-lite/Dialog.test.tsx: 6 → 3

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| renders nothing while closed | MERGE | → "renders nothing while closed and a modal named by its title when open" | One `render` plus a `rerender`. Trivial on its own. |
| shows a modal dialog named by its title | MERGE | same as above | Same as above. |
| closes on Escape | MERGE | → "closes on Escape and on a press outside the panel, not inside it" | Both are custom listeners in `DialogBackdrop`. Same render. |
| closes on a press outside the panel but not inside it | MERGE | same as above | Same as above. |
| moves focus to the first control when it opens | MERGE | → "moves focus to the first control and keeps it inside while open" | This is react-aria `FocusScope autoFocus contain`. The only thing we decide is the configuration, so one test is enough. Autofocus is also covered by Issue "REQ-023: the delete confirmation focuses Cancel". |
| keeps focus inside while open, even when something outside takes it | MERGE | same as above | Same as above. |

### track-lite/Field.test.tsx: 5 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| links the label to the control | REMOVE | Every `getByLabelText("Name" / "Key" / …)` in Shell, Profile and the screens | Trivial. |
| marks the control invalid and describes it with the error | MERGE | → "Field: help, then error, then neither, sets aria-invalid and aria-describedby, and an error replaces the help" | One render with two rerenders, all on the same setup. |
| leaves a valid control unflagged | MERGE | same as above | Same as above. |
| Field: help text shows under the control and is linked by aria-describedby | MERGE | same as above | Same as above. |
| Field: an error replaces the help text | MERGE (target) | same as above | Same as above. |

### track-lite/Pill.test.tsx: 4 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| shows the tip on keyboard focus and hides it on blur | MERGE | → "REQ-015.2: the tip shows on hover or keyboard focus, hides on leave, blur or Escape, and adds to the child's description" | Same `renderTrigger()`. Hover and focus are also covered by List "REQ-036.4: … shows in full on hover and keyboard focus" and MyIssues REQ-042.3. |
| hides the tip on Escape | MERGE | same as above | Same as above. |
| describes the child by the tip and keeps its existing description | MERGE | same as above | Same as above. |

REQ-015.2 is marked "Verify: manual" in the spec. This merged test is the only one named after it, so it is kept.

### track-lite/AppShell.test.tsx: 3 → 1

| Test | Action | Covered by | Reason |
|---|---|---|---|
| renders a rail item with an href as a link marked as the current page | REMOVE | NotificationStatus "STD-2: admins get the Notifications link, current on its page" (sidebar link with `href` and `aria-current="page"`), Shell REQ-015.3 (`href`) | |
| names a rail label action by its label and reports presses | REMOVE | Shell REQ-009.1 and STD-2 (click "New project" → dialog opens) | |

Kept: suffix and title handling, including `title=""`. This is used by `Sidebar.tsx` and not asserted anywhere else.

### track-lite/Segmented.test.tsx: 3 → 1

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| checks the option matching the value | MERGE | → "Segmented checks the option matching the value and reports the chosen one" | Same render. `Segmented` is not used in the app yet. |
| renders link tabs as navigation with only the current view marked | REMOVE | `screens/Project.test.tsx` "marks List as the current view on the list address" (`aria-current` on List, none on Board) and the header test | |

### track-lite/Status.test.tsx: 3 → 1

| Test | Action | Merge target | Reason |
|---|---|---|---|
| names the status for assistive tech | MERGE | → "Status and Priority icons are named; urgent is a plate and other levels light one bar per step" | Three trivial renders. One test covers all of them. |
| draws urgent priority as a plate instead of bars | MERGE | same as above | Same as above. |
| lights one bar per priority step | MERGE (target) | same as above | Same as above. |

### track-lite/ListRow.test.tsx: 2 → 1

| Test | Action | Covered by | Reason |
|---|---|---|---|
| BoardColumn names its region after the status and shows the count and action | REMOVE | Board "REQ-024.1: one column per status in order, each with its issue count", STD-7 empty columns, REQ-029.1 (+ button) | |

Kept: the BoardCard tab-order test (handle, then link, then menu). Tab order isn't asserted in Board tests.

### track-lite/Table.test.tsx: 2 → 0

| Test | Action | Covered by | Reason |
|---|---|---|---|
| a sortable heading is a button in a column header that calls onSort | REMOVE | List REQ-040.1, REQ-039, REQ-036.3 (`aria-sort` none, ascending and descending; `sortBy` clicks a heading) | |
| shows an arrow only on the sorted heading, with aria-sort giving the direction | REMOVE | `aria-sort` is covered as above; whether an svg is present is trivial rendering | |

### track-lite/IssueLayout.test.tsx: 2 → 0

| Test | Action | Covered by | Reason |
|---|---|---|---|
| Comment shows "Name · time", the edited mark and its actions in the head | REMOVE | CommentThread REQ-031.1 (name, "just now"), REQ-033.1 ("(edited)"), the options button in every menu test | Asserts class names and child order, which is trivial rendering. |
| IssueTitleInput is a wrapping text area that carries its error state | REMOVE | Issue "REQ-016.3: a title of only spaces…" (`aria-invalid`) | Prop passthrough and a class name. |

### track-lite/Button.test.tsx: 1 → 0

| Test | Action | Covered by | Reason |
|---|---|---|---|
| danger variant renders the tl-btn--danger class and stays a type=button that can be disabled | REMOVE | Disabled buttons are covered by every STD-5 screen test | Mostly class-name assertions. Caveat: the `type="button"` default does matter (it stops accidental form submits). If the owner wants to keep one assertion for it, reduce this test to that. |

---

### src/lib/markdown/Markdown.test.tsx: 8 → 4

All security tests are kept, either as they are or merged.

| Test | Action | Merge target / covered by | Reason |
|---|---|---|---|
| REQ-012.3: `<script>alert(1)</script>` in a description is shown as text | MERGE | → "SEC-002.1, REQ-012.3: raw HTML (`<img onerror>`, `<script>`) is shown as text" | Same code path and same assertion shape. Keep both inputs. Also covered at screen level by ProjectDetail REQ-012.3. |
| REQ-012.1: a description with a heading and a bullet list is shown formatted | REMOVE | ProjectDetail "REQ-012.1: saving a description … shows it formatted", REQ-046.1, Issue REQ-022.1 | This is the markdown library's rendering, and it is covered three times at screen level. |
| DATA-001.2: @nobody, not in the mentions list, is plain text | MERGE | → "DATA-001.1, DATA-001.2, DATA-001.4: only a listed @member outside code is highlighted, titled with their name" | Same `mentions={[sam]}` render. Use one source with `@sam`, `@nobody`, inline code and a fenced block. |
| DATA-001.4: @sam in inline code or a code block is code, not a mention | MERGE | same as above | Same as above. |

Kept: SEC-002.1 (as the merge target), SEC-002.2 (`javascript:` link becomes plain text), and SEC-002 (http, https and mailto get `target=_blank` and `rel=noopener noreferrer`).

### src/lib/markdown/parse.test.ts: 6 → 3

| Test | Action | Merge target | Reason |
|---|---|---|---|
| DATA-001.6: (@sam) and @sam, thanks both mention Sam | MERGE | → "DATA-001.1, DATA-001.6, DATA-001: @sam is found next to punctuation, once per member" | Pure `findMentions` checks on the same function. |
| DATA-001: a member mentioned several times is found once | MERGE | same as above | Same as above. |
| DATA-001.5: sam@acme.com and foo@sam are not mentions | MERGE | → "DATA-001.4, DATA-001.5: @ in code, in emails or inside words is not a mention" | Negative cases go together. |

Kept: REQ-044 `toPlainText`.

---

### Cross-cutting patterns

1. **Design-system tests repeat the screen tests.** `renderAppAt` renders the real `ClientApp`, so Picker, MultiPicker, Menu, MenuSubmenu, MentionList, LinkTabs, TableSortHead, RailItem and BoardColumn are already exercised with the same roles and ARIA assertions by the Issue, Labels, Board, List, Project and NotificationStatus screen tests. About 25 of the 50 design-system tests go. Keep a design-system test only for behaviour no screen reaches: × clearing a filter, the rail title suffix, card tab order, and components with no consumer yet.
2. **Tests of react-aria behaviour.** Menu Escape and focus restore, FocusScope autofocus and focus trapping, `aria-expanded` and `aria-multiselectable` on listboxes. At most one test per configured behaviour, and none for library defaults.
3. **One state per test where a rerender or a sequence would do.** This applies to useShowLoading, Toaster, Field, Status, Dialog open and closed, and dates. Fold the states into one test with a `rerender` or a sequence of timer steps.
4. **One test per server status code.** Each of 422, 404, 409, 500, 503 and network errors gets its own test (CommentThread edits, NewIssueDialog, api.test, Shell REQ-009.3 and REQ-009.4). The browser shows the server `message` as-is, so one test per form should cover "the server message is shown and the text is kept". Answer the statuses in sequence from one mock.
5. **STD-5 and STD-9 are tested separately in each form.** The "Saving…/Posting…/Creating… is disabled" test, the failed-save toast test and the retry-requestId test fit in one test per form: answer `networkError`, then `never`.
6. **Server rules re-tested in the client under their own IDs** (REQ-009.4 key format, REQ-016.3 blank title). In the client these are just field-error display. Fold them into the form's field-error test and list the IDs in its name.
7. **Shell-level tests covered by every screen test** (M0.4 shell loads, STD-1 redirect, archived header in NewIssueDialog). Remove them where `renderAppAt` or a lower-level unit test (api.test STD-1) already pins the behaviour.
8. **Possible future guard.** `CommandMenu` and `Segmented` have no app consumer. Their tests are kept minimal (2 and 1). If they stay unused, they are dead-code candidates under the prebuilt-component exemption.

---

