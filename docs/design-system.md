# Track Lite design system

The app's component kit lives in `src/components/ui/track-lite/` and keeps the name Track Lite. Its look follows the **Docket** design system from the Claude Design export "Tracklite project setup" (2026-10-25). The export is in `docs/design/`: Docket's tokens, fonts and component bundle in `_ds/docket-design-system-…/`, and Tracklite's own markup on Docket tokens in `tracklite-app.css`. This file keeps the usage rules, so screens can follow them without opening the export.

The visual language is quiet and dense: a cream canvas, the main area in a lighter inset panel, warm graphite ink, hairline rules, Geist for everything a person reads and Geist Mono for machine values, and one chromatic accent, eraser (`--primary`).

The kit moves to Docket in execution plan rows D02–D07 (tokens and fonts, icons, controls, overlays, lists and board, shell). D02 replaced the tokens and fonts: `styles/` holds Docket's light tokens only (no dark theme), and every old `--color-*`, `--font-ui`, `--font-serif` and `--shadow-*` reference was mapped to its nearest Docket token in one mechanical pass, so components keep their old layout until D04–D07 restyle them. Until D03 lands, icons are still Phosphor. Build new work to these rules.

## What's in the repo

| Path | Contents |
|---|---|
| `styles/index.css` | Entry point, loaded once by `src/app/layout.tsx` |
| `styles/colors.css`, `typography.css`, `spacing.css` | Tokens |
| `styles/base.css` | Body and heading defaults, links, focus ring, `.sr-only` |
| `styles/components.css` | Every component's `tl-*` class rules |
| `*.tsx` | `AppShell` (Rail, RailItem, RailLabel, RailLabelAction, RailNote, AppBar, Crumbs…), `Button`, `Card`, `CommandMenu` (Filters, FilterRule, Toasts), `Dialog` (AppDialog, TitleInput), `Field` (Input, Textarea, FieldError; `help` text under the control), `IssueLayout` (Meta, Pick, Prose, Editor, Feed, Comment…), `ListRow` (ListGroup, CollapsibleListGroup, ListRowLink, ListRowHead, Board, BoardColumn, BoardCard, BoardEmpty, Drawer…), `Nav`, `Pill` (Kbd, Tip, TipTrigger, Avatar…), `Pop` (PopItem, PopSearch, Menu, MenuItem, MenuSubmenu, MenuSep…), `Progress` (Ring, Metric, Spark, Workload, Timeline), `Segmented` (Radio, Checkbox, LinkTabs), `Settings` (SettingsLayout, SettingsIdentity, SettingsForm, SettingsSection, SettingsGrid, SettingsInline, SettingsEmpty, SettingsActions, FactList, Fact, FormStatus, WarningNote, FormError), `SignedOut` (SignedOutLayout, SignedOutForm, SignedOutHeading, SignedOutFields, SignedOutFormError, SignedOutMessage, SignedOutAlert, SignedOutStatus), `Status` (Priority, Glyph), `Table`, `Tag` |

Differences from the Track Lite Claude Design project the kit was first ported from (claude.ai/design/p/803a56b3-e94a-4a12-bb36-40e90e225931). Rows D02–D07 update these as they restyle each component:
- Fonts load through `next/font/google`, and icons through `@phosphor-icons/react`, instead of CDN links (the CSP allows only `'self'`). The project's `Icon` wrapper was dropped.
- `useToasts` was dropped: toasts follow STD-9 through the Redux `toast` slice. `Toasts` shows a dismiss button only when given `onDismiss`.
- `SignedOut` and `Field`'s `help` were added in the repo for the signed-out screens (M1.7) and aren't in the Claude Design project yet. Add them there before the next import, or keep them when importing.
- `Settings` was added in the repo for the Profile page (M1.8) and isn't in the Claude Design project yet. The same applies.
- For the Members page (M2.5), the repo added `SettingsLayout wide` (900px), `SettingsSection` (a titled section with an optional status line), `SettingsInline` (a field beside its button), `SettingsEmpty`, the table cell classes `tl-table__who`, `__mono`, `__muted`, `__note` and `__end`, and `Menu` / `MenuItem` / `MenuSep` in `Pop`. `Menu` is a React Aria menu button styled with the `tl-pop` classes, with `[data-focused]` marking the keyboard-focused item. `Dialog` (and `AppDialog`) now wrap their panel in React Aria's `FocusScope`, so focus moves to the first control on open, stays inside while open, and returns afterwards. None of these are in the Claude Design project yet. The same applies.
- For the Labels page (M3.7), the repo added `SettingsList`, `SettingsRow`, `SettingsCell` and `SettingsRowActions` (a list of rows separated by hair rules, with fixed-width muted cells and end-aligned actions). `Menu` also takes a `text` trigger with a `quiet` or `secondary` `variant` in place of the icon, a `selectedKey` that makes it a single-select menu with ✓ on the chosen item, and `id` / `aria-describedby` so it can be the control of a `Field`. None of these are in the Claude Design project yet. The same applies.
- For the Issue page (M4.4), the repo added `IssueTitleInput` (a text area with the `IssueTitle` type that wraps long titles, with the clay focus ring and the terracotta ring when `aria-invalid`), `Picker` and `PickerItem` in `Pop` (a React Aria `Select` whose trigger is a `Pick`, opening a `tl-pop` listbox with ✓ on the chosen item; items take any content, such as a `Status`, `Priority` or `Avatar`, and an optional `search` adds a filter field through React Aria's `Autocomplete`), and `PickValue` (a read-only value at `Pick`'s size, for archived issues). An open `Pick` keeps the hover fill. None of these are in the Claude Design project yet. The same applies.
- For the label picker and description editor (M4.5), the repo added `MultiPicker` in `Pop` (a React Aria `Select` with `selectionMode="multiple"`, using `PickerItem`, a filter field, and an optional "Create …" row from `createText`; the Pick grows to wrap label pills and the list stays open after each toggle), `MentionList` in `Pop` (the `@` suggestion list: `Pop` and `PopItem` with `Avatar` and the username in mono, the highlighted row marked by the selected fill and a clay ring instead of ✓, absolutely positioned by its caller), `IssueSection` (a titled main-column section with an optional action, such as Edit, on its hair-ruled head), `Editor`'s `mono` (Markdown source in mono), `invalid` (the terracotta ring) and `overlay` (content positioned over the text area, such as `MentionList`), and a `.tl-prose` checklist style using the `tl-check` box. A mention's full name stays a native `title`, since `Mention` isn't focusable. None of these are in the Claude Design project yet. The same applies.
- For the Board (M5.4), the repo reworked `BoardCard` into an `article` named by its title: the title is a link stretched over the whole card and cut off after 2 lines, with slots for a drag `handle`, `priority`, `assignee` and a `menu` (the **⋯**, placed top right but last in tab order). `BoardColumn` is a region named after its label, takes an `action` (the **+**), and its body holds `tl-board-col__list`, which scrolls on its own with `position: relative` (D-40). `BoardEmpty` is the muted empty-column line with an optional text-button action. `Pop` gained `MenuSubmenu` (a React Aria `SubmenuTrigger` with a ▸ caret; its items report to the root `Menu`'s `onAction`), and `MenuItem` gained `icon`, `checked` (✓) and `disabled`. A `Status` glyph inside `FormStatus` text gets a 5px gap. The "+N" label overflow uses `Pill kind="est"`. None of these are in the Claude Design project yet. The same applies.
- For board drag and drop (M5.5), each column's cards are a React Aria `GridList`. The card's drag `handle` is a React Aria `Button slot="drag"` with the `tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon` classes and a `DotsSixVertical` icon, since the kit's `Button` can't fill a React Aria slot. `tl-board-col__slot` marks a drop position: since M11.2b each column is virtualized (React Aria `Virtualizer` with `ListLayout`, 7px padding and gap), so the layout places cards, and a drop target between cards is a 7px `BoardDrop` bar in the gap. An empty column shows `BoardDrop` instead of its empty line while a card is over it. None of these are in the Claude Design project yet. The same applies.
- For the List page (M6.2), the repo added: `TableSortHead` (a `th` holding a button, with `aria-sort` and an arrow only when sorted); `Table sticky` (sticky headings in the list-group fill) `Table columns` (fixed column widths) and `Table minWidth` (the table scrolls sideways in `tl-table-scroll` below that width, so an `auto` column never collapses); the row classes `tl-table__row` and `tl-table__link` (the title link is stretched over the whole row and cut off to one line), `tl-table__cell` (icon plus text, cut off) and `tl-table__message-row`/`tl-table__message` for in-table messages; `tl-table-scroll`, the scroll box under the filter toolbar; `FilterPicker` in `CommandMenu` (a filter that is a dashed `FilterAdd` button while empty and a `FilterRule` reading “is” or “is any of” with values, opening a multi-select React Aria list of `PickerItem`s; open filters get the `--bg-selected` fill); `Filters label`, which makes the toolbar a named `<search>` landmark; `Input compact` (28px) with an `icon` slot, and `tl-filters__search`; and `Tip wide` / `TipTrigger wide` (up to 520px, for full titles). The “Unassigned” avatar is the existing `Avatar empty`. None of these are in the Claude Design project yet. The same applies.
- For the comment thread (M7.2), the repo reworked `Comment` into an `article` whose head reads "Avatar Name · time", followed by an optional `edited` mark (muted mono) and an `actions` slot pushed to the end (the **⋯** `Menu`). Its body is no longer wrapped in `Prose`, because the app's Markdown renderer brings its own; the body's `Prose` gets `min-width: 0` so wide code scrolls inside the comment. `CommentList` stacks comments 10px apart. None of these are in the Claude Design project yet. The same applies.
- For comment links (M7.3), `Comment` takes an `id` (the `#comment-{id}` anchor) and `highlighted`, which adds `tl-comment--highlighted`: the clay outline, switched on and off instantly with no motion, shown for 2 seconds after the page scrolls to a linked comment. It isn't in the Claude Design project yet. The same applies.
- For My issues (M8.2), a `tl-table__row` whose `tl-table__link` has keyboard focus draws the 2px clay outline around the whole row at offset −2px, instead of around the title. This also applies to the List page. It isn't in the Claude Design project yet. The same applies.
- For the design refresh (M17.5), board columns share the width (`flex: 1 0 248px`) and name themselves with an `h2`; the head's rule darkens to `--hairline-strong` once the column's list is scrolled (`data-scrolled`). `BoardCard` places the drag `handle` and the **⋯** `menu` top right (left of the assignee), shown on hover or focus and always on touch, and still in tab order; `closed` turns the priority grey. The urgent plate and the In Progress ring use `--danger`. `IssueTitle` is 42px, and the title input fills `--bg-selected` on hover and `--surface-1` on focus. `IssueSection` has its rule on top. `Comment` is unboxed (a hair rule on top) with "· time" right-aligned, and `CommentList` stacks comments 15px apart. None of these are in the Claude Design project yet. The same applies.
- For My issues (M17.12), the repo added `AppBarCount` (a mono count after the page title, read out as its `label`), `ListNote` (a muted note under a list), and the row-link cells `tl-list-row__prio` (centred priority), `tl-list-row__muted` (muted text cut off with "…") and `tl-list-row__labels` (label pills that shrink and clip). `tl-table-scroll` is positioned, so off-screen skip links inside it don't stretch the page. None of these are in the Claude Design project yet. The same applies.
- For the List view (M17.16), `ListRowHead` takes an optional `label`: with one it is a `fieldset` named by it (so the controls in it are reachable) instead of an `aria-hidden` row. `ListSortButton` is a sortable column head inside it, with the arrow for the current direction and ", sorted ascending" or ", sorted descending" read out after its name. `tl-list-row__cell` is an icon-and-text cell cut off with "…", and `tl-list-message` is the "No issues match these filters" line under a list head. None of these are in the Claude Design project yet. The same applies.
- For the Issue page (M17.10), `IssueLayout` takes `title`, `side` and `main` and reads in that order; the side is an `aside` named "Issue fields", and `Rail` is now named "Sidebar" so the two landmarks differ. It is an inline-size container: below 860px of its own width it becomes one column with the fields (in a grid of 180px cells, ruled on top) between the title and the description. `IssueSideFoot` holds the created line (date in mono) and Delete under a hair rule. `IssueEmpty` is a 13px muted line with an optional link-styled action button ("No description yet. Add one."). `EditorNotice` is the `role="alert"` row in an editor bar holding the conflict message and its Reload button. None of these are in the Claude Design project yet. The same applies.
- The member menu (M17.6) is a `Menu variant="rail"` in the rail's `foot`: a full-width rail item with an `Avatar size="md"`, the member's name in `Lbl` and a caret-up, opening upward. The rail head holds `Logo size="rail"`; project rows use a square `Glyph` and a mono " · KEY" suffix; a `RailNote` holds short notes such as the empty projects note. A page-level message such as Not found uses `tl-page-message` with a serif `tl-page-message__title`.
- For Project details (M17.11b), `DetailsLayout` is a 640px column of sections 30px apart. `DetailsSection` is a region named by its meta-label `h2`, with an optional `aside` (a quiet Edit button, or a count such as "4 open" with the number in a mono `data`) on a head ruled underneath. `CountRow` is a 36px link row of an `aria-hidden` icon, a name and a mono count, used for the per-status counts. `DetailsNote` is the 12px muted created line, its `time` in mono. None of these are in the Claude Design project yet. The same applies.
- For Profile and Notification status (M17.14), `FactList split` puts each fact's value at the row's right end (label left), for side-by-side fact columns such as Worker and Queue. A row header (`th` in a table body, such as a channel name) is styled as a plain body cell. Neither is in the Claude Design project yet. The same applies.
- `TipTrigger` attaches its hover, focus, blur and Escape handlers to the wrapped child (composed with the child's own) instead of to the wrapping `<span>`, so the only element with handlers is the focusable one. `RailItem` and `Button` take `ref` as a plain prop (React 19) instead of using `forwardRef`. A `Crumbs` item's `onClick` receives the click event, so a page can route the click in the browser instead of reloading.
- `Status` and `Priority` use the kit's own names (`progress`, `review`, `med`). Map the schema's `in_progress`, `in_review` and `medium` to them where they're used.

## Importing updates from Claude Design

After changing the design in Claude Design, export it into `docs/design/` (rename its `CLAUDE.md` to `BRIEF.md`) and give Claude Code this prompt (fill in or delete the last sentence):

```text
Pull the latest Docket design system and tracklite-app.css from docs/design/ into src/components/ui/track-lite/. Port it the same way as before: TypeScript with no comments, fonts through next/font and icons through lucide-react (no CDN files), and keep every item under "Differences from the Claude Design project". Write tests first for new or changed interactive components, run npm test, npm run lint and npm run typecheck, and update this file plus the spec and tech design if the change touches them. Ask me before resolving any conflict with components the app already uses. What changed: [e.g. new Avatar component, warmer accent colour].
```

Don't use `/design-sync` for this. It uploads the repo to Claude Design, the opposite direction.

## Voice and copy

- Plain, specific and matter-of-fact. Help text uses "you"; the product never says "I" or "we".
- Sentence case everywhere. Uppercase is only a typographic treatment (eyebrows).
- Actions are verbs ("Create issue", "Post"). Feedback is a past-tense fact ("WEB-42 moved to In Review").
- Machine values are in mono: IDs, dates, counts, relative times.
- Use the ellipsis character (…) and curly quotes. No exclamation marks and no emoji.

## Colour

Light theme only; Docket's dark theme isn't used.

- The page is `--canvas` (cream `#F3EFE8`). The main area sits in an inset `--surface-1` panel. Surfaces step lighter toward white: `--surface-2` for raised or hovered things, `--surface-3` for menus, popovers and dialogs. Text is `--ink`, with `--ink-muted`, `--ink-subtle` (secondary text, deactivated members) and `--ink-tertiary` (placeholders, hints).
- Eraser `--primary` (`#C97253`) is the one accent. It marks the interactive and the primary: primary buttons, the focus ring (`--focus-ring`, `--primary-ring`), selection, the current item, links (`--text-link`). Text on an eraser fill is `--on-primary` (near-black; white fails contrast).
- `--danger` is only for exceptions: overdue and destructive (destructive buttons and menu items, field errors, the notification-status warnings). Urgent priority is Docket's `PriorityIcon` (circle-alert), not a red fill.
- `--warning` is for warning-tone tags, such as a bounced invitation.
- Status and label colours come from their tokens (`--status-backlog`, `-progress`, `-review`, `-done`, `-canceled`; `--label-*`), never hard-coded hex.
- Hover is `--bg-hover`; selected is `--bg-selected`, or `--primary-tint` where the eraser marks the choice.

## Type

- Geist (`--font-display`, `--font-text`) for all text, from page titles to chrome. There is no serif.
- Geist Mono (`--font-mono`) for machine values.
- Product UI runs at 13px weight 500 for titles and 12px for meta. Headings are weight 600 with slight negative tracking. Eyebrows are weight 500, uppercase, with positive tracking.
- Use the size tokens in `styles/typography.css` (`--ui-size`, `--body-sm-size`, `--caption-size`, `--subhead-size`…), not raw pixel values.

## Space and shape

- Spacing is on a 4px base (`--space-xxs` 4 … `--space-xxl` 48).
- Fixed sizes: 240px sidebar, 28px sidebar row, 40px list row, 48px page header, 36px input and md button, 28px sm button, 20px default avatar.
- Separate rows and panels with 1px hairlines (`--hairline`; `--hairline-strong` for emphasis, such as a scrolled column head; `--hairline-tertiary` for control edges), not boxes.
- Radii: 4px chips, 6px tags, icon buttons and sidebar rows, 8px buttons, inputs and board cards, 12px board columns, dialogs and the main panel. Pills only for segmented tabs and badges. Avatars are round.
- Shadows only on floating layers: `--elev-menu` for menus and popovers, `--elev-dialog` for dialogs over the 60% scrim (`--overlay`). Cards use `--elev-1` (an inset top highlight), not a drop shadow.
- No gradients, imagery or textures. Motion is colour and opacity only, 100ms for hover (`--dur-fast`), with no bounce or scale.

## States

- Hover: `--bg-hover` fill or one surface step up; text goes from subtle to ink. Primary lightens to `--primary-hover`.
- Press: primary darkens to `--primary-pressed`; others step one surface further.
- Selected: `--bg-selected` fill, plus ✓ in menus.
- Focus: the 2px eraser ring (`--focus-ring`). Inputs keep their border and add the ring.
- Invalid: a `--danger` border, and the error line under the field with the round "!" mark (hidden from assistive tech).
- Disabled: 45% opacity and a not-allowed cursor.

## Layout

A full-height grid: the 240px sidebar on the canvas, and the main area in an inset `--surface-1` panel with an 8px margin and 12px radius. Project pages have a 48px header (name, Board | List segmented tabs, settings, New issue). Lists use 40px rows under sticky group heads; board columns share the width.

## Icons

- [Lucide](https://lucide.dev) through `lucide-react`: outline, 14–16px, 1.75 stroke, `currentColor`. Never load icons from a CDN.
- Status and priority use the Docket glyphs at 14px and 2 stroke, in their token colours: `StatusIcon` (circle-dashed backlog, circle-dot in progress and in review, circle-check done, circle-x canceled) and `PriorityIcon` (signal bars for low to high, circle-alert for urgent).
- Unicode stands in for icons in a few places: ✓ for selected menu items, × for close and remove, / between breadcrumbs.
- The logo is `Logo`: the "lifted card" mark (a board card tilted −9° over a faded outline card) in Docket ink, surface and eraser, beside the wordmark Tracklite in Geist 600. Size `rail` (22px mark, 17px wordmark) sits in the sidebar head, `signed-out` (26px, 20px) in the signed-out header. The mark is hidden from assistive tech; the wordmark names it.
