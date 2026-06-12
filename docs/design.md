# Kaybee — Design System

The `/lookbook/` folder is the design authority. All visual decisions are already made there. Do not introduce new patterns without checking it first.

---

## Lookbook Files

| File | Purpose |
|---|---|
| `lookbook/styles.css` | Single CSS file — all tokens, components, layout. Copy to `src/server/assets/styles.css`. |
| `lookbook/Loop Library.html` | Main library view — home, category browse, card grid, activity feed. |
| `lookbook/Templates.html` | Reader / article view and granular components. |
| `lookbook/Sync Architecture.html` | Internal architecture diagram (reference only). |

---

## Themes — one palette per site

Each Kaybee site (IT KB, People, …) can run its own palette. Set the `THEME` env var per deploy — no code change:

| Theme | Feel |
|---|---|
| `sun` *(default)* | Warm yellow — the Monokai Pro Light Sun palette below |
| `sky` | Cool blue light |
| `meadow` | Soft green light |
| `blossom` | Warm pink light |
| `midnight` | Monokai Pro dark |

Implementation: the bottom of `src/server/assets/styles.css` has one `body[data-theme="…"]` block per theme that overrides only the `:root` tokens — every component inherits automatically. `layout.ts` reads `THEME` and sets the attribute (`activeTheme()`); unknown values fall back to `sun`. To add a theme: copy a block, restyle the tokens, add the name to `THEMES` in `src/server/partials/layout.ts`.

---

## Colour Palette — Monokai Pro Light Sun

```css
/* Surfaces */
--bg: #faf4ce;           /* page background */
--bg-elevated: #fdf9dd;  /* cards, raised surfaces */
--bg-sunken: #f4ecbc;    /* inputs, code backgrounds */
--paper: #fffdf2;        /* pure white-ish surface */

/* Ink */
--ink: #2c232e;          /* primary text */
--ink-2: #4a4146;        /* secondary text */
--ink-3: #72696a;        /* muted text, meta */
--ink-4: #a39584;        /* timestamps, very muted */

/* Accents */
--red: #ce4770;   --orange: #cc6633;  --yellow: #b16803;
--green: #218871; --blue: #1f6fd0;    --purple: #6851a2;
```

---

## Typography

- **Sans:** Geist — loaded from Google Fonts
- **Mono:** Geist Mono — loaded from Google Fonts
- Never substitute either. Load via `<link>` in every HTML template.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

---

## Hero

The home page hero renders the site title (from `SHARED_DRIVE_NAME`, defaults to "Loop Library") over an inline SVG gradient backdrop — no raster image, no external asset.

- The backdrop is produced by the `hero` partial when called with `backdrop: true` (see `src/server/partials/hero.ts`). It's a `<svg>` with a yellow → orange → red linear gradient plus a soft paper-coloured radial highlight.
- Only the home view enables the backdrop. Sub-pages (category, doc, tag, calendar) call `hero(...)` without `backdrop` so the layout stays plain.
- Breadcrumb context lives in the per-page `<nav class="crumb">` (see `src/server/partials/breadcrumb.ts`). The header brand no longer carries a crumb — it was duplicating that nav.

To retitle the home hero per environment, set `SHARED_DRIVE_NAME` in `.env` (local) or Cloud Run env vars (deploy). To tweak the gradient, edit the two `<linearGradient>` / `<radialGradient>` blocks in `hero.ts` — the stop colours reference the palette tokens (`var(--yellow)`, `var(--orange)`, `var(--red)`, `var(--paper)`), so a palette change automatically restyles the backdrop.

---

## For AI: Changing the Design

> For non-technical users. Read this before asking an AI to change anything visual.

**The one file to edit for all visual changes: `src/server/assets/styles.css`**

### Change the colour palette
First check whether one of the built-in themes fits — set `THEME` in `.env` (local) or Cloud Run env vars (deploy) to `sun`, `sky`, `meadow`, `blossom`, or `midnight`. No code change.

For a custom palette: open `src/server/assets/styles.css`. Edit the values inside `:root { }` at the top (or copy one of the `body[data-theme="…"]` blocks at the bottom into a new theme). Every component inherits from these variables — you only need to change them in one place.

### Change the fonts
1. Find the `<link href="https://fonts.googleapis.com/...">` tag in `src/server/partials/layout.ts`
2. Replace `Geist` with your preferred Google Font name
3. Update `--font-sans` (and optionally `--font-mono`) in the `:root` block of `src/server/assets/styles.css`

### Add a new page section
1. Open one of the lookbook HTML files and find a section that looks like what you want
2. Copy the `<section class="section">...</section>` block
3. Paste it into the relevant view in `src/server/views/` (one file per page)
4. Use existing CSS classes only: `.doc-card`, `.cat-tile`, `.tag`, `.btn`, `.activity-row`, etc.
5. Do not write new CSS unless no existing class fits

### Restyle the hero backdrop
The backdrop is an inline SVG inside `src/server/partials/hero.ts` (the `heroBackdrop()` function). It uses two gradient definitions — change the `stop-color` / `stop-opacity` values, or swap the two `<rect>` fills, and the home page picks it up on next reload. The colours reference palette tokens (`var(--yellow)`, etc.), so a palette change in `styles.css` already restyles it.

### Use a raster image instead of the SVG backdrop
Drop the file into `src/server/assets/`. In `hero.ts`, replace the inline `<svg class="hero-backdrop">` with `<img class="hero-backdrop" src="/assets/your-image.jpg" alt="" />`. The existing `.hero-backdrop` CSS already covers it (`inset: 0; width: 100%; height: 100%`), so no CSS change needed.

### Change the site name shown in the hero
Set `SHARED_DRIVE_NAME` in `.env` locally, or in Cloud Run env vars on deploy. The home view reads it at request time — no code change. Falls back to "Loop Library" when unset.

### Change the brand mark / header branding
Edit `src/server/partials/topbar.ts` (brand block) and `src/server/partials/layout.ts` (title tag). The logo mark (`.brand-mark`) is drawn in pure CSS — ask the AI to redesign it if needed.

### Change the accent colour on a specific component
Each component uses a CSS variable (e.g. `var(--green)`, `var(--orange)`). Ask the AI: *"Change the accent on doc cards from orange to blue"* and it will update the one or two class references involved.

---

## For AI: Changing the Code

> For non-technical users. Tell the AI these three things before any code change request.

1. **What you want** — in plain English
2. **What is happening now** — copy the error message, or describe the current behaviour
3. **Which area** — sync, search, display, or deployment

### Key files by area

| What you want to change | File |
|---|---|
| How Drive docs are fetched | `src/drive/exporter.ts` |
| How the sync trigger works | `src/sync/handler.ts` |
| How Markdown becomes HTML | `src/render/markdown.ts` |
| How pages and search work | `src/server/routes.ts` + `src/server/views/*.ts` |
| Reusable HTML fragments (topbar, footer, cards) | `src/server/partials/*.ts` |
| Calendar feed | `src/calendar/client.ts` |
| How documents are stored/read | `src/firestore/docs.ts` |
| How images are stored | `src/storage/assets.ts` |
| How often the reconciler runs | The n8n scheduled workflow or Cloud Scheduler (no code — configured outside the repo) |

### What the AI should never do without being asked
- Switch the database, runtime, or search engine
- Change the CSS palette or fonts
- Rewrite large sections of code to fix a small bug
- Add npm packages without explaining why
