# Remaining things

Gaps found while reviewing `docs/tech-design.md` against the code (2026-10-09). In each case the design or the spec describes something the code doesn't do. For each one, decide whether to fix the code or drop the claim from the docs.

## 8. Some domain functions don't declare their contract return type

- **Docs:** design §3.5 and D-44. Mapping functions declare the contract type as their return type, so an extra field fails to compile.
- **Code:** `listProjects` (`src/server/projects.ts:42`, including its `.map` callback), `listLabels`, `createLabel` and `updateLabel` (`src/server/labels.ts:57, 70, 83`) and `lookUpInvitation` (`src/server/invitations.ts:171`) have no declared return type; their routes rely on `satisfies`.
- **Effect:** a field added to those responses by accident would still compile.
