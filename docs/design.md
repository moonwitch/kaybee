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

## Known Gap — Hero Image

The home page is missing a hero image at the top. For MVP, add a placeholder. For production, replace with a real image.

```html
<!-- Inside <div class="hero">, before <h1> -->
<div class="hero-image-placeholder"></div>
```

```css
/* In src/server/assets/styles.css */
.hero-image-placeholder {
  width: 100%;
  height: 280px;
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
  margin-bottom: 28px;
}

/* When a real image is ready, swap to: */
.hero-image {
  width: 100%;
  max-height: 360px;
  object-fit: cover;
  border-radius: var(--radius-lg);
  margin-bottom: 28px;
}
```

---

## For AI: Changing the Design

> For non-technical users. Read this before asking an AI to change anything visual.

**The one file to edit for all visual changes: `src/server/assets/styles.css`**

### Change the colour palette
Open `src/server/assets/styles.css`. Edit the values inside `:root { }` at the top. Every component inherits from these variables — you only need to change them in one place.

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

### Add the hero image
Replace `<div class="hero-image-placeholder">` with `<img class="hero-image" src="/assets/your-image.jpg" alt="..." />` (drop the file into `src/server/assets/`) and update the CSS as shown above. The placeholder is rendered by the `hero` partial when `showImagePlaceholder: true` is passed — find it in `src/server/views/home.ts`.

### Change the site name or branding
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
