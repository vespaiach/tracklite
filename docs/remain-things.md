# Remaining things

Gaps found while reviewing `docs/tech-design.md` against the code (2026-10-09). In each case the design or the spec describes something the code doesn't do. For each one, decide whether to fix the code or drop the claim from the docs.

## 5. Webhook answers `500` to a signed body that isn't usable JSON

- **Docs:** design §5.4. Answer `200` whenever the signature is valid, even for ignored events.
- **Code:** `src/server/email-webhook.ts:56` calls `JSON.parse` without catching errors, and reads `data.email_id` without checking it exists.
- **Effect:** a correctly signed body that isn't JSON, or has no `data.email_id`, gets a `500`, and Resend keeps retrying it.

## 6. `PATCH /api/projects/{KEY}` silently drops `name` alongside a description save

- **Docs:** design §3.3. The body is either `{ name?, archived? }` (admin) or `{ description, descriptionVersion }` (member).
- **Code:** `src/schemas/project.ts` accepts all four fields together. When a description save is present, `src/server/projects.ts:68-70` saves only the description: it ignores `name` and `archived`, and skips the admin check.
- **Effect:** the browser never sends this combination. A hand-made request gets `200` with part of its change ignored. Nothing admin-only is applied, so skipping the admin check doesn't open a permission hole. Either refuse the mix in the schema ("Change one thing at a time"), or check admin and apply both.

## 7. `PATCH /api/issues/{ID}` silently drops other fields alongside a description save

- **Docs:** design §3.1 and §3.3. An issue `PATCH` holds one field; anything else gets "Change one field at a time".
- **Code:** `src/schemas/issue.ts:26-37` lets any body containing `description` or `descriptionVersion` skip the one-field check, and `src/server/issues.ts:333-335` then saves only the description.
- **Effect:** the same as item 6, on issues. The browser never sends the mix; a hand-made `{ description, descriptionVersion, title }` gets `200` and the title is ignored.

## 8. Some domain functions don't declare their contract return type

- **Docs:** design §3.5 and D-44. Mapping functions declare the contract type as their return type, so an extra field fails to compile.
- **Code:** `listProjects` (`src/server/projects.ts:42`, including its `.map` callback), `listLabels`, `createLabel` and `updateLabel` (`src/server/labels.ts:57, 70, 83`) and `lookUpInvitation` (`src/server/invitations.ts:171`) have no declared return type; their routes rely on `satisfies`.
- **Effect:** a field added to those responses by accident would still compile.
