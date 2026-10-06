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
| `*.tsx` | `AppShell` (Rail, RailItem, RailLabel, RailLabelAction, AppBar, Crumbs…), `Button`, `Card`, `CommandMenu` (Filters, FilterRule, Toasts), `Dialog` (AppDialog, TitleInput), `Field` (Input, Textarea, FieldError; `help` text under the control), `IssueLayout` (Meta, Pick, Prose, Editor, Feed, Comment…), `ListRow` (ListGroup, Board, BoardColumn, BoardCard, BoardEmpty, Drawer…), `Nav`, `Pill` (Kbd, Tip, TipTrigger, Avatar…), `Pop` (PopItem, PopSearch, Menu, MenuItem, MenuSubmenu, MenuSep…), `Progress` (Ring, Metric, Spark, Workload, Timeline), `Segmented` (Radio, Checkbox, LinkTabs), `Settings` (SettingsLayout, SettingsIdentity, SettingsForm, SettingsSection, SettingsInline, SettingsEmpty, SettingsActions, FactList, Fact, FormStatus, FormError), `SignedOut` (SignedOutLayout, SignedOutForm, SignedOutHeading, SignedOutFields, SignedOutFormError, SignedOutNote, SignedOutStatus), `Status` (Priority, Glyph), `Table`, `Tag` |

Differences from the Claude Design project:
- Fonts load through `next/font/google`, and icons through `@phosphor-icons/react`, instead of CDN links (the CSP allows only `'self'`). The project's `Icon` wrapper was dropped.
- `useToasts` was dropped: toasts follow STD-9 through the Redux `toast` slice. `Toasts` shows a dismiss button only when given `onDismiss`.
- `SignedOut` and `Field`'s `help` were added in the repo for the signed-out screens (M1.7) and aren't in the Claude Design project yet. Add them there before the next import, or keep them when importing.
- `Settings` was added in the repo for the Profile page (M1.8) and isn't in the Claude Design project yet. The same applies.
- For the Members page (M2.5), the repo added `SettingsLayout wide` (900px), `SettingsSection` (a titled section with an optional status line), `SettingsInline` (a field beside its button), `SettingsEmpty`, the table cell classes `tl-table__who`, `__mono`, `__muted`, `__note` and `__end`, and `Menu` / `MenuItem` / `MenuSep` in `Pop`. `Menu` is a React Aria menu button styled with the `tl-pop` classes, with `[data-focused]` marking the keyboard-focused item. `Dialog` (and `AppDialog`) now wrap their panel in React Aria's `FocusScope`, so focus moves to the first control on open, stays inside while open, and returns afterwards. None of these are in the Claude Design project yet. The same applies.
- For the Labels page (M3.7), the repo added `SettingsList`, `SettingsRow`, `SettingsCell` and `SettingsRowActions` (a list of rows separated by hair rules, with fixed-width muted cells and end-aligned actions). `Menu` also takes a `text` trigger with a `quiet` or `secondary` `variant` in place of the icon, a `selectedKey` that makes it a single-select menu with ✓ on the chosen item, and `id` / `aria-describedby` so it can be the control of a `Field`. None of these are in the Claude Design project yet. The same applies.
- For the Issue page (M4.4), the repo added `IssueTitleInput` (a text area with the `IssueTitle` type that wraps long titles, with the clay focus ring and the terracotta ring when `aria-invalid`), `Picker` and `PickerItem` in `Pop` (a React Aria `Select` whose trigger is a `Pick`, opening a `tl-pop` listbox with ✓ on the chosen item; items take any content, such as a `Status`, `Priority` or `Avatar`, and an optional `search` adds a filter field through React Aria's `Autocomplete`), and `PickValue` (a read-only value at `Pick`'s size, for archived issues). An open `Pick` keeps the hover fill. None of these are in the Claude Design project yet. The same applies.
- For the label picker and description editor (M4.5), the repo added `MultiPicker` in `Pop` (a React Aria `Select` with `selectionMode="multiple"`, using `PickerItem`, a filter field, and an optional "Create …" row from `createText`; the Pick grows to wrap label pills and the list stays open after each toggle), `MentionList` in `Pop` (the `@` suggestion list: `Pop` and `PopItem` with `Avatar` and the username in mono, the highlighted row marked by the selected fill and a clay ring instead of ✓, absolutely positioned by its caller), `IssueSection` (a titled main-column section with an optional action, such as Edit, on its hair-ruled head), `Editor`'s `mono` (Markdown source in mono), `invalid` (the terracotta ring) and `overlay` (content positioned over the text area, such as `MentionList`), and a `.tl-prose` checklist style using the `tl-check` box. A mention's full name stays a native `title`, since `Mention` isn't focusable. None of these are in the Claude Design project yet. The same applies.
- For the Board (M5.4), the repo reworked `BoardCard` into an `article` named by its title: the title is a link stretched over the whole card and cut off after 2 lines, with slots for a drag `handle`, `priority`, `assignee` and a `menu` (the **⋯**, placed top right but last in tab order). `BoardColumn` is a region named after its label, takes an `action` (the **+**), and its body scrolls on its own with `position: relative` (D-40); `tl-board-col__list` lays out its cards. `BoardEmpty` is the muted empty-column line with an optional text-button action. `Pop` gained `MenuSubmenu` (a React Aria `SubmenuTrigger` with a ▸ caret; its items report to the root `Menu`'s `onAction`), and `MenuItem` gained `icon`, `checked` (✓) and `disabled`. A `Status` glyph inside `FormStatus` text gets a 5px gap. The "+N" label overflow uses `Pill kind="est"`. None of these are in the Claude Design project yet. The same applies.
- `TipTrigger` attaches its hover, focus, blur and Escape handlers to the wrapped child (composed with the child's own) instead of to the wrapping `<span>`, so the only element with handlers is the focusable one. `RailItem` and `Button` take `ref` as a plain prop (React 19) instead of using `forwardRef`. A `Crumbs` item's `onClick` receives the click event, so a page can route the click in the browser instead of reloading.
- `Status` and `Priority` use the kit's own names (`progress`, `review`, `med`). Map the schema's `in_progress`, `in_review` and `medium` to them where they're used.

## Importing updates from Claude Design

After changing the design system in Claude Design, give Claude Code this prompt (fill in or delete the last sentence):

```text
Pull the latest Track Lite design system from the Claude Design project linked in docs/design-system.md into src/components/ui/track-lite/. Port it the same way as before: TypeScript with no comments, fonts through next/font and icons through @phosphor-icons/react (no CDN files), and keep every item under "Differences from the Claude Design project". Write tests first for new or changed interactive components, run npm test, npm run lint and npm run typecheck, and update this file plus the spec and tech design if the change touches them. Ask me before resolving any conflict with components the app already uses. What changed: [e.g. new Avatar component, warmer accent colour].
```

Don't use `/design-sync` for this. It uploads the repo to Claude Design, the opposite direction.

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
- `Button variant="danger"` (paper on `--color-accent-2-700`, 5.87:1) is only for the one confirming action in a destructive confirmation dialog, such as "Deactivate" or "Revoke invitation". Pair it with a secondary "Cancel" that takes focus first. Destructive menu items stay `PopItem danger` (terracotta text, no fill).
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

- Phosphor through `@phosphor-icons/react`, duotone weight, 13–16px in chrome (15px by default). Import each icon from its own module (`@phosphor-icons/react/dist/csr/DotsThree`), not the package root, which loads every icon. Use bold for the small "+" in "New issue".
- Status, priority and the rail's saved-view marks are drawn in CSS (`Status`, `Priority`, `Glyph`), never with icons.
- Unicode stands in for icons in a few places: ✓ for selected menu items, × for close and remove, / between breadcrumbs, ⌘ ↑ ↓ ↵ in key caps.
- There's no logo. The brand is the product name, Tracklite, in the serif at weight 600.
