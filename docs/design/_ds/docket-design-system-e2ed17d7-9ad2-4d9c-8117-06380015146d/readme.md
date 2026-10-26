# Docket Design System

Docket is a project-management product: issue tracker, cycles and kanban boards for software teams. This design system covers two surfaces:

- **App** — the dense, keyboard-first product UI (sidebar, grouped issue list, kanban board, issue detail, create dialog).
- **Website** — the dark marketing site (home, pricing, changelog).

## Sources
- `uploads/DESIGN.md` — a structural analysis of linear.app's marketing system (surface ladder, type scale, radii, spacing, component specs). Used as the **structural** reference: values for type, spacing, radii and component padding are copied from it verbatim.
- **Pencil Box** palette from Brand Spanking You, "12 modern color palettes to steal" — https://bebrandspankingyou.com/blog/2018/10/18/brand-better-12-modern-color-palettes-to-steal — hexes `#D2CEC2 #E0D5C1 #7A7570 #C97253 #BC804E`. Used as the **color** source; the lavender of the reference is replaced by eraser `#C97253` and the blue-black neutrals by warm graphite.
- No codebase, Figma or logo was provided. **There is no logo** — the wordmark "Docket" is set in Geist 600 wherever a mark would go. "Docket" is a placeholder product name; replace it if you have one.

## Index
- `styles.css` — entry point (imports only)
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css` (spacing, radii, elevation, motion), `base.css`
- `fonts/` — Geist + Geist Mono woff2 (latin)
- `assets/icons/` — 57 Lucide SVGs (copied from lucide-static 0.460.0)
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand)
- `components/` — React primitives, see below
- `ui_kits/app/` — interactive app recreation · `ui_kits/website/` — marketing site
- `SKILL.md` — Agent Skill wrapper · `thumbnail.html` — project tile

## Components
- **core/** — Button, IconButton, Badge, Tag, Avatar, Kbd, Icon
- **forms/** — TextInput, SegmentedTabs
- **surfaces/** — Card, ChangelogRow, Menu
- **navigation/** — TopNav, Footer, SidebarItem
- **issues/** — StatusIcon, PriorityIcon, IssueRow, KanbanCard, BoardColumn

From DESIGN.md: Button (primary/secondary/tertiary/inverse), SegmentedTabs (pricing tabs), Card (feature, pricing, featured, screenshot, testimonial, cta), TextInput, ChangelogRow, Badge (status-badge), Tag (inline tag), TopNav, Footer.

### Intentional additions
- **Icon** — wrapper for the bundled Lucide subset so glyphs inherit currentColor.
- **IconButton, Kbd, Menu, SidebarItem** — needed for the product UI (DESIGN.md covers marketing only; it references dropdown menus on surface-3 and keyboard-driven use).
- **Avatar** — DESIGN.md specifies avatar circles (rounded.full, 32–40px) on testimonials.
- **StatusIcon, PriorityIcon, IssueRow, KanbanCard, BoardColumn** — the issue-tracker/kanban domain; DESIGN.md "Known gaps" notes the in-product status/label palette, which these components carry.
- Customer-logo tile from DESIGN.md is **not** built — no customer logos exist.

---

## CONTENT FUNDAMENTALS
- **Voice:** plain, confident, technical. Short declarative sentences. The product speaks to builders, not managers. No hype words ("revolutionary", "supercharge").
- **Person:** "you" for the reader, "we" sparingly (changelog). The product never says "I".
- **Casing:** Sentence case everywhere — headlines, buttons, menu items, nav ("Create issue", "Talk to sales"). Eyebrows are the only uppercase, with +0.4px tracking.
- **Headlines:** two short imperative clauses work well: "Plan the cycle. Ship the work." / "Every issue, in its place."
- **Buttons:** verb + noun, 1–3 words: "Create issue", "Start trial", "Read the changelog".
- **Product copy:** terse and factual. Empty state: "You're all caught up." Toast: "DOC-1284 moved to In review". Placeholders end in an ellipsis: "Add description…", "Leave a comment…".
- **Identifiers:** issue IDs are `TEAM-NUMBER` in mono (`DOC-1284`); shortcuts shown as Kbd (`C`, `⌘ ↵`).
- **Changelog:** date + version, a noun-phrase title ("Board swimlanes"), then one or two sentences of what changed and why.
- **Emoji:** never. Unicode only for keys (⌘ ↵) and the curly quotes in testimonials.

## VISUAL FOUNDATIONS
- **Color:** light by default (canvas `#F3EFE8`); dark via `data-theme="dark"`, canvas `#0B0A09` (warm graphite tint, never pure black). Hierarchy via a 4-step surface ladder (`--surface-1…4`) plus hairlines (`--hairline`, `-strong`, `-tertiary`). Ink is cream-derived `#F2EEE6`; muted text is Pencil Box putty, disabled is graphite. **Eraser `#C97253` is the single chromatic accent** — primary CTA, focus ring, brand chip, urgent priority. Ochre `#BC804E` appears only as "In review" status / secondary label. Status and label colors are muted to sit with the palette. **Light mode (default):** tokens live on `:root`; `data-theme="light"`/`"paper"` force it on a subtree, `data-theme="dark"` switches to dark. Canvas `#F3EFE8`, surfaces step *lighter* toward white, ink `#1A1816`. Status, label and semantic hues are darkened for contrast on cream; eraser fill and on-primary stay the same, link/hover text darkens to `#A3502F`/`#B86446`. Menu/dialog shadows soften to warm 10–18%. Both UI kits have a sun/moon toggle, persisted in `localStorage['docket-theme']`. Never hard-code a theme color in a component — aliases and elevations re-resolve per `[data-theme]` scope.
- **On-primary text** is near-black `#170E0A` (white on eraser fails contrast).
- **Type:** Geist for display and text, Geist Mono for IDs/keys/code. Display 600 with aggressive negative tracking (−3px at 80px, −1.8px at 56px); body 400, ~0 tracking. Product UI runs at 13px/500 for titles, 12px meta.
- **Spacing:** 4px base (4, 8, 12, 16, 24, 32, 48, 96). Cards pad 24; testimonial 32; CTA banner 48. Product rows are 40px; sidebar rows 28px; headers 48px; marketing nav 56px.
- **Radii:** 4 chips/kbd · 6 tags, icon buttons, sidebar rows · 8 buttons, inputs, kanban cards · 12 cards, board columns, app main panel · 16 product screenshot panel · pill only for segmented tabs and badges. CTAs are never pill.
- **Cards:** surface-1 fill, 1px hairline, inset 1px top edge highlight (`--elev-1`). No drop shadow. Featured/hover = lift to surface-2 + hairline-strong.
- **Shadows:** only for floating layers — menus (`--elev-menu`) and dialogs (`--elev-dialog`).
- **Backgrounds:** flat canvas. No gradients, no imagery textures, no spotlight glows. The product UI itself is the hero image (framed in a 16px screenshot card).
- **Imagery:** none supplied. If added, prefer real product captures; warm, desaturated.
- **Hover:** background step (`--bg-hover` 5% cream) or one surface step up; text goes subtle → ink. Primary button lightens to `#D88A6D`.
- **Press:** primary darkens to `#B86446`; others step one more surface. No scale/shrink.
- **Focus:** 2px eraser ring at 50% (`--focus-ring`).
- **Motion:** quick and quiet — 100ms for hover color, 160–240ms for panels, `cubic-bezier(.2,.7,.2,1)`. Fades and color transitions only; no bounce.
- **Transparency/blur:** only the sticky marketing nav (80% canvas + 12px blur) and the modal scrim (60% black).
- **Layout:** marketing container 1280px, 32px gutters, 96px between sections, 3-up card grids. App: 240px sidebar on canvas, main content in an inset surface-1 panel (8px margin, 12px radius).

## ICONOGRAPHY
- **Set:** [Lucide](https://lucide.dev) (ISC) — **substitution**: the reference product uses a proprietary icon set. Lucide's 24px grid, round caps and outline style are the closest open match. Rendered at 1.75 stroke (2 for status/priority) at 14–16px.
- **Files:** `assets/icons/*.svg` (57 icons, copied programmatically) and `components/core/iconData.js` (same markup, used by `<Icon name="…" />`).
- Status glyphs: circle-dashed (backlog), circle (todo), circle-dot (in progress / review), circle-check (done), circle-x (canceled). Priority: signal-low/medium/high, circle-alert (urgent), ellipsis (none).
- Icons are always monochrome currentColor, except status/priority and team chips which take a token color.
- No emoji. No icon font. Unicode only for ⌘ ↵ in Kbd.

## Fonts
Geist / Geist Mono (Google Fonts, OFL) substitute for the proprietary sans/mono referenced in DESIGN.md. Files are in `fonts/` (latin variable woff2).
