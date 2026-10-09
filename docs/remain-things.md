# Remaining things

Gaps found while reviewing `docs/tech-design.md` against the code (2026-10-09). In each case the design or the spec describes something the code doesn't do. For each one, decide whether to fix the code or drop the claim from the docs.

## 1. No sign-out or Profile in the app shell

- **Docs:** design §6.2 and build plan line 96. The bottom of the sidebar shows the member's initials and name, which open a menu with **Profile** and **Sign out**.
- **Code:** `src/client/Sidebar.tsx` and `src/client/Shell.tsx` render no member menu, and nothing links to `/settings/profile`. `useSignOutMutation` is only used by `AcceptInvitation.tsx` and `ResetPassword.tsx`.
- **Effect:** a signed-in member has no way to sign out, and can reach their profile only by typing the address.

## 2. Reset and invitation tokens stay in the address bar

- **Docs:** design §4.2. The reset page reads `?token=` once, then removes it from the address bar with `history.replaceState`.
- **Code:** `src/client/screens/ResetPassword.tsx:25` and `src/client/screens/AcceptInvitation.tsx:31` read the token with `useSearchParams()` and never remove it.
- **Effect:** the token stays in the address bar and the browser history. Caddy's log filter and `Referrer-Policy: same-origin` still keep it out of logs and referrers.

## 3. No re-hash when the Argon2 settings change

- **Docs:** design §4.1. The settings are stored inside each hash, and a successful sign-in re-hashes the password with new settings when they change.
- **Code:** `src/server/passwords.ts` only wraps `hash` and `verify`, and `src/server/sign-in.ts` never checks a stored hash's settings.
- **Effect:** none today. It matters only once the hashing settings change.

## 4. Lowercase project addresses aren't rewritten

- **Docs:** design §6.1 and REQ-016.5. An address in lower case is replaced with its canonical form.
- **Code:** `src/client/screens/Issue.tsx:58-66` rewrites `/issue/web-42` to `/issue/WEB-42`. `src/client/screens/Project.tsx` and `src/client/ProjectGate.tsx` pass `:key` through unchanged, so `/project/web` stays as typed.
- **Effect:** the page still works, because the API matches keys ignoring capitals, but the address isn't canonical.

## 5. Webhook answers `500` to a signed body that isn't usable JSON

- **Docs:** design §5.4. Answer `200` whenever the signature is valid, even for ignored events.
- **Code:** `src/server/email-webhook.ts:56` calls `JSON.parse` without catching errors, and reads `data.email_id` without checking it exists.
- **Effect:** a correctly signed body that isn't JSON, or has no `data.email_id`, gets a `500`, and Resend keeps retrying it.

## 6. `PATCH /api/projects/{KEY}` silently drops `name` alongside a description save

- **Docs:** design §3.3. The body is either `{ name?, archived? }` (admin) or `{ description, descriptionVersion }` (member).
- **Code:** `src/schemas/project.ts` accepts all four fields together. When a description save is present, `src/server/projects.ts:68-70` saves only the description: it ignores `name` and `archived`, and skips the admin check.
- **Effect:** the browser never sends this combination. A hand-made request gets `200` with part of its change ignored. Nothing admin-only is applied, so skipping the admin check doesn't open a permission hole. Either refuse the mix in the schema ("Change one thing at a time"), or check admin and apply both.
