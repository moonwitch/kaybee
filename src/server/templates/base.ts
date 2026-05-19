/**
 * Base HTML shell — wraps every page.
 * Loads Geist fonts and the shared stylesheet.
 */
export function baseShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)} · Loop Library</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/public/styles.css" />
</head>
<body>
<div class="app">
${body}
</div>
</body>
</html>`
}

/**
 * Shared top navigation bar.
 * Renders an active search if a query is provided.
 */
export function topbar(opts: {
  crumb?: string
  query?: string
}): string {
  return `<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">Loop</span>
      <span class="brand-sub">Library</span>
      ${opts.crumb ? `<span class="brand-crumb">/ ${escHtml(opts.crumb)}</span>` : ''}
    </a>
    <div class="search-wrap">
      <form action="/search" method="get">
        <svg class="search-icon icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          class="search-input"
          type="search"
          name="q"
          placeholder="Search the library…"
          value="${escAttr(opts.query ?? '')}"
          autocomplete="off"
        />
        <span class="search-kbd">⌘K</span>
      </form>
    </div>
    <div class="topnav-actions">
      <span class="avatar" aria-label="You">K</span>
    </div>
  </div>
</header>`
}

/**
 * Shared footer.
 */
export function footer(): string {
  return `<footer class="container">
  <div class="foot">
    <div class="left">
      <span class="sun-stripe">
        <i style="background:var(--yellow)"></i>
        <i style="background:var(--orange)"></i>
        <i style="background:var(--red)"></i>
        <i style="background:var(--purple)"></i>
        <i style="background:var(--blue)"></i>
        <i style="background:var(--green)"></i>
      </span>
      <span>Loop · Library</span>
    </div>
    <div>powered by Kaybee</div>
  </div>
</footer>`
}

/** Escape HTML entities to prevent XSS in template interpolations. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape for HTML attribute values. */
export function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
