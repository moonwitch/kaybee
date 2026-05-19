import { escHtml, escAttr } from '../lib/html.ts'

export interface TopbarOpts {
  crumb?: string
  query?: string
}

export function topbar(opts: TopbarOpts = {}): string {
  return `<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <b class="brand-name">Loop</b>
      <small class="brand-sub">Library</small>
      ${opts.crumb ? `<small class="brand-crumb">/ ${escHtml(opts.crumb)}</small>` : ''}
    </a>
    <nav class="topnav-links" aria-label="Primary">
      <a href="/">Library</a>
      <a href="/cat/">Categories</a>
      <a href="/calendar">Calendar</a>
    </nav>
    <search class="search-wrap">
      <form action="/search" method="get" role="search">
        <svg class="search-icon icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          class="search-input"
          type="search"
          name="q"
          placeholder="Search the library…"
          value="${escAttr(opts.query ?? '')}"
          autocomplete="off"
          aria-label="Search the library"
        />
        <kbd class="search-kbd">⌘K</kbd>
      </form>
    </search>
    <div class="topnav-actions">
      <span class="avatar" aria-label="You">K</span>
    </div>
  </div>
</header>`
}
