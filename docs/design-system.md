# Track Lite design system

Ported from the Claude Design project "Track Lite Design System" (claude.ai/design/p/803a56b3-e94a-4a12-bb36-40e90e225931) into `src/components/ui/track-lite/`. This file keeps the project's usage rules, so screens can follow them without opening the project.

The visual language is editorial: a warm paper ground, near-black ink, a serif for anything a person wrote, and a clay accent, applied to a dense, keyboard-first app.

## What's in the repo

| Path | Contents |
|---|---|
| `styles/index.css` | Entry point, loaded once by `src/app/layout.tsx` |
| `styles/colors.css`, `typography.css`, `spacing.css` | Tokens |
| `styles/base.css` | Body and heading defaults, focus ring, `.tnum`, `.eyebrow`, `.halftone`, `.sr-only` |
| `styles/components.css` | Every component's `tl-*` class rules |
| `*.tsx` | `AppShell` (Rail, RailItem, AppBar, Crumbs…), `Button`, `Card`, `CommandMenu` (Filters, FilterRule, Toasts), `Dialog` (AppDialog, TitleInput), `Field` (Input, Textarea, FieldError), `IssueLayout` (Meta, Pick, Prose, Editor, Feed, Comment…), `ListRow` (ListGroup, Board, BoardColumn, BoardCard, Drawer…), `Nav`, `Pill` (Kbd, Tip, Avatar…), `Pop` (PopItem, PopSearch…), `Progress` (Ring, Metric, Spark, Workload, Timeline), `Segmented` (Radio, Checkbox), `Status` (Priority, Glyph), `Table`, `Tag` |

Differences from the Claude Design project:
- Fonts load through `next/font/google`, and icons through `@phosphor-icons/react`, instead of CDN links (the CSP allows only `'self'`). The project's `Icon` wrapper was dropped.
- `useToasts` was dropped: toasts follow STD-9 through the Redux `toast` slice. `Toasts` shows a dismiss button only when given `onDismiss`.
- `Status` and `Priority` use the kit's own names (`progress`, `review`, `med`). Map the schema's `in_progress`, `in_review` and `medium` to them where they're used.

## Voice and copy

- Plain, specific and matter-of-fact. Help text uses "you"; the product never says "I" or "we".
- Sentence case everywhere. Uppercase is only a typographic treatment (eyebrows).
- Actions are verbs ("Create issue", "Comment"). Feedback is a past-tense fact ("WEB-42 moved to In review").
- Machine values are in mono: IDs, dates, estimates, counts, key caps, relative times.
- Use the ellipsis character (…) and curly quotes. No exclamation marks and no emoji.

## Colour

- Paper `--color-paper` is the ground, `--color-surface` is for filled things, and ink `--color-ink` is for text.
- Clay (`--color-accent`) marks the interactive and the measured: primary buttons, selection, focus, done and review, progress.
- Terracotta (`--color-accent-2`) marks the exception: urgent, in progress, overdue, destructive, the "today" line. Never use both accents in one small component.
- Neutral greys cover backlog, canceled, tracks and the dark surfaces. Process yellow appears only on the warn toast stripe.
- Text and rules use ink at fixed alphas: `--color-ink-2` (secondary), `--color-ink-3` (muted), `--color-divider` (structural rules), `--color-hair` (between rows), `--color-tint-2` (hover), `--color-tint` (rail, board columns).

## Type

- Source Serif 4 (`--font-serif`) is for titles, prose and headline figures. In the app, issue titles in rows and cards are the only serif.
- Archivo (`--font-ui`) is for all chrome, at 10–13px.
- JetBrains Mono (`--font-mono`) is for machine values.
- Headings are weight 600 with −0.015em tracking. Eyebrows are Archivo 500, uppercase, 10–10.5px, 0.1em tracking.

## Space and shape

- Spacing steps are 5px (5, 10, 15, 20, 30, 40). Fixed sizes are exact: 44px app bar, 36px list row and input, 32px rail item, 29px menu item, 26px small button, 19px pill. Odd values such as 7px are intentional.
- Separate rows and panels with 1px rules, not boxes. Only things that sit on the page are filled: board cards, popovers, toasts, dialogs, `Card`.
- Corners are nearly square: 1px for pills, 2px for buttons, inputs and cards, 4px for dialogs. Only avatars, status rings and presence dots are round.
- Shadows come in three ink-tinted steps (`--shadow-sm`, `--shadow-md` for popovers and toasts, `--shadow-lg` for dialogs).
- No gradients, textures, imagery, blur or motion beyond instant colour changes. A dragged card rotates −1.4° with `--shadow-md`.

## States

- Hover: `--color-tint-2` fill on chrome. Press goes one step further.
- Selected: `--color-accent-100` fill with `--color-accent-800` text, plus ✓ in menus.
- Focus: 2px clay outline with a 2px offset (inputs use offset 0 and a clay border).
- Disabled: 45% opacity and a not-allowed cursor.

## Layout

A full-height grid: a 232px rail (52px collapsed) and the body. The app bar and filter toolbar stay fixed while the list scrolls under sticky group heads. The issue drawer is 400px; board columns are 268px.

## Icons

- Phosphor through `@phosphor-icons/react`, duotone weight, 13–16px in chrome (15px by default). Use bold for the small "+" in "New issue".
- Status, priority and the rail's saved-view marks are drawn in CSS (`Status`, `Priority`, `Glyph`), never with icons.
- Unicode stands in for icons in a few places: ✓ for selected menu items, × for close and remove, / between breadcrumbs, ⌘ ↑ ↓ ↵ in key caps.
- There's no logo. The brand is the product name, Tracklite, in the serif at weight 600.
