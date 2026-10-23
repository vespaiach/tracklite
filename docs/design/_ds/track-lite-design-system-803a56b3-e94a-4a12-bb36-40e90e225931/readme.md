# Track Lite Design System

Track Lite is a project-manager tracking system: an issue tracker for small product teams with a collapsible rail, grouped list and kanban board views, a split-view issue drawer, filters, a ⌘K command menu, a new-issue modal and toasts. Its visual language is editorial — warm paper ground, near-black ink, a serif for anything a person wrote, and a clay accent — applied to a dense, keyboard-first app.

## Sources

- Codebase: `track-lite/` (attached local folder, Next.js 16 + React 19 + Tailwind CSS v4). Key files: `app/globals.css` (all tokens), `app/layout.tsx` (fonts), `app/issues/page.tsx` (the only product screen), `components/ui/*`, `components/app/*`, `lib/sample-data.ts`.
- The codebase README describes itself as a "Lite" rebuild of a "Linear – Broadsheet" design system (source project `96c4cc83-5300-45d5-8412-4a1efa913ec6`). That project was not provided; press treatments (CMYK plates, wedges, registration marks) and deck/landing templates were not ported into Track Lite and are not here either.

One product surface exists: the **Track Lite app** (Issues screen). A foundations showcase page (`app/page.tsx`) exists in the source but is a specimen page, not a product view.

## Index

- `styles.css` — entry point; `@import`s only
- `tokens/` — `fonts.css` (Google Fonts), `icons.css` (Phosphor CDN), `colors.css`, `typography.css`, `spacing.css` (spacing, radii, shadows, rhythm), `base.css` (body/heading defaults, focus, `.tnum`, `.eyebrow`, `.halftone`, `.sr-only`)
- `components/components.css` — every component's class rules (`tl-*`), ported 1:1 from the Tailwind utilities
- `components/<group>/` — React components + `.d.ts` + `.prompt.md` + one card
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand)
- `ui_kits/track-lite/` — interactive recreation of the Issues screen
- `thumbnail.html`, `SKILL.md`

### Components

Grouped by directory; each group mirrors a source file.

- `core/` — **Button**, **Tag**, **Card** (CardKicker, CardTitle, CardBody, CardMeta), **Table**, **Icon**
- `forms/` — **Field** (Input, Textarea, FieldError), **Segmented** (Radio, Checkbox)
- `dialogs/` — **Dialog** (AppDialog, DialogBackdrop, TitleInput)
- `shell/` — **AppShell** (Lbl, Rail, RailGroup, RailLabel, RailItem, WorkspaceSwitcher, AppBar, AppBarTitle, Crumbs), **Nav** (NavLink)
- `glyphs/` — **Status** (Priority, Glyph), **Pill** (Dot, Kbd, Kbds, Tip, Avatar, AvatarStack)
- `popover/` — **Pop** (PopSearch, PopLabel, PopItem, PopSep, PopFoot)
- `views/` — **ListRow** (ListGroup, ListDate, Board, BoardColumn, BoardCard, BoardDrop, ProjectCard, Drawer)
- `issue/` — **IssueLayout** (IssueTitle, Meta, Pick, Prose, Mention, IssueLink, Editor, EditorTool, Feed, FeedItem, FeedLine, FeedTime, Comment)
- `data/` — **Progress** (ProgressKey, Ring, Metric, Spark, Workload, Timeline)
- `overlays/` — **CommandMenu** (Filters, FilterRule, FilterAdd, Toasts, useToasts)

Intentional additions:
- `Icon` — wraps the Phosphor web font; the source imports `@phosphor-icons/react`, which can't load here.
- `CommandMenu inline` and `Toasts inline` props — render without fixed positioning so cards can preview them.
- `Segmented compact` prop — replaces the source's one-off `[&_label]:py-[4px] [&_label]:px-2` override in the app bar.

### UI kits

- `ui_kits/track-lite/` — Issues: rail, list ⇄ board, filters, drawer with status picker, comment editor, ⌘K, new-issue modal (`C`), toasts.

## Content fundamentals

- **Voice:** plain, specific, matter-of-fact. Second person in help text ("Leave a comment…"); the product never says "I" or "we".
- **Casing:** sentence case everywhere — buttons, menu items, titles ("Create new issue", "Switch to board view", "Show issues assigned to me"). Uppercase is only a typographic treatment (eyebrows), never typed in caps.
- **Titles read like headlines, not labels:** "Board columns lose scroll position on filter change", "Inbox badge count drifts after bulk archive", "Cache project progress between page loads".
- **Actions are verbs:** "Create issue", "Comment", "Archive", "Display", "New issue".
- **Feedback is a past-tense fact:** "TRK-142 moved to In review", "Created TRK-143" + "View", "Comment posted: …". Activity lines: "**Mara Kell** moved from Todo to In progress · 2h".
- **Machine values in mono:** IDs (TRK-142), dates (Oct 06), estimates (3), counts, key caps (⌘K, C, esc), relative times (2h).
- **Empty / placeholder copy:** "Issue title", "Change status…", "Type a command or search…", "No results for “q”", "Unassigned", "None". Ellipsis character (…), curly quotes.
- **No exclamation marks, no emoji.** The only "!" is the urgent-priority glyph and the field-error mark.

## Visual foundations

- **Color:** paper `#f8f2ed` ground, surface `#efe3d9` for filled things, ink `#2b1c15`. Clay `#8d4936` (accent) is for the interactive and the measured — primary buttons, selection, focus, done/review, progress. Terracotta `#dd7450` (accent-2) is for the exception — urgent, in progress, overdue, destructive, over capacity, the "today" line. Never both accents in one small component. Neutral greys (a cool ramp) handle backlog/todo/canceled, tracks and the dark surfaces. Process yellow appears only as the warn toast stripe.
- **App inks:** text and rules are ink at fixed alphas — ink-2 70% (secondary), ink-3 45% (muted), divider 16%, hair 9%, tint-2 8% (hover), tint 4% (rail, board columns).
- **Type:** three families with strict jobs. Source Serif 4 (400/600) for every title, prose and headline figure — in the app, issue titles in rows and cards are the only serif. Archivo (400/500/600) for all chrome at 10–13px. JetBrains Mono (400/500) for machine values. Headings 600 with −0.015em tracking (issue title −0.02em). Eyebrows: Archivo 500 uppercase, 10–10.5px, 0.1–0.11em.
- **Spacing:** 1.25× density — spacing steps in 5px (5/10/15/20/30/40). Fixed component sizes are exact pixels: 44px app bar, 36px list row / sub-bar / input, 32px rail item / group head, 29px menu item, 26px small button, 24px filter chip, 19px pill, 18px key cap. Odd values (7px, 6px, 9px) are intentional — keep them.
- **Rules, not boxes:** rows, columns and panels separate with 1px hairlines (hair 9% between rows, divider 16% for structural rules). Filled surfaces only for things that sit on the page: board cards, popovers, toasts, dialogs, Card.
- **Cards:** board/project cards are paper with a hair border, 2px radius, no shadow; hover darkens the border to ink-3. `Card` is surface-filled with optional shadow. No colored left-border cards — the only left-edge accents are the selected list row's 2px clay inset and the toast stripe.
- **Corner radii:** nearly square — 1px (pills, checkboxes, workspace mark), 2px (buttons, inputs, cards, popovers), 4px (dialogs, command menu). Round only for avatars, status rings and presence dots. Agents get square avatars.
- **Shadows:** ink-tinted, three steps. sm 0 1px 2px / 14%; md 0 3px 10px / 16% (popover, toast, tooltip, dragging card); lg 0 12px 32px / 22% (dialogs, ⌘K, floating drawer). No inner shadows except the invalid-field ring and radio inset.
- **Backgrounds:** flat paper. No gradients, no textures, no full-bleed imagery in the app. CSS gradients appear only functionally (status arcs, ring, timeline lanes).
- **Imagery:** none ships in the source. When imagery is needed, the `.halftone` utility applies a newsprint dot screen (grayscale .35, contrast 1.15, 3px multiply dots) — warm, slightly desaturated.
- **Transparency & blur:** transparency is used for inks and scrims (neutral-900 at 50% for dialogs, 30% for ⌘K). No backdrop blur anywhere.
- **Dark surfaces:** only toasts and tooltips (neutral-900 with paper text).
- **Hover:** tint-2 fill (8% ink) on chrome; secondary buttons 7% ink; ghost 10% clay; cards darken their border. Text links go clay on hover.
- **Press:** one step further — 14% ink on secondary/quiet, 18% clay on ghost, accent-700 on primary. No scale/shrink.
- **Selected:** accent-100 fill + accent-800 text (rail item, menu item, list row), plus ✓ in menus. Segmented control fills clay with paper text.
- **Focus:** 2px clay outline, 2px offset (inputs: offset 0 with clay border).
- **Disabled:** 45% opacity, not-allowed cursor.
- **Motion:** none beyond instant color changes. The drag state rotates a card −1.4° with shadow-md and a clay border. Toasts auto-dismiss after 4s.
- **Layout:** full-height grid — 232px rail (52px collapsed) + body. Header bar and filter toolbar fixed at top of body; list scrolls with sticky group heads (opaque 96% paper/ink mix so rows don't show through). 400px issue drawer docks right; board columns are 268px.

## Iconography

- **System:** Phosphor icons, duotone weight, 13–16px in chrome (15px default; 14px in the editor toolbar and segmented control). Bold weight for the small "+" in the New issue button; regular for 11–12px plus/caret marks. The source uses `@phosphor-icons/react`; here the same set loads from the Phosphor web-font CDN (`tokens/icons.css`) and is wrapped by `Icon`. No icon SVGs or sprites exist in the codebase to copy.
- **Icons used:** magnifying-glass, tray, user-circle, stack, arrows-clockwise, target, gear, caret-down, bell, sidebar-simple, list-bullets, kanban, plus, text-b, text-italic, code, link-simple, paperclip, chat-circle.
- **CSS glyphs, never icons:** status (dashed backlog ring, open todo, 60%/85% arcs for progress/review, solid done with check, struck canceled), priority (three ascending bars; urgent = terracotta "!" plate), and `Glyph` rail marks for saved views at 12px (square, circle, diamond, rules, half, plus) "where a duotone icon turns to mud".
- **Unicode as icons:** ✓ for selected menu items, × for close/remove/dismiss, / for breadcrumb separators, ⌘ ↑ ↓ ↵ in key caps.
- **Emoji:** never.
- **Logo:** none exists in the source. The brand renders as the plain word "Track Lite" in the serif (600), or the mono "T" workspace mark on a clay square. Do not draw a logo.

## Fonts

Source Serif 4, Archivo and JetBrains Mono load from Google Fonts — the same families the source loads via `next/font/google`. No font binaries are in the codebase, so none are bundled here.
