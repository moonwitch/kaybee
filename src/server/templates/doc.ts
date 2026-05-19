import type { KaybeeDoc } from '../../firestore/docs.ts'
import { baseShell, topbar, footer, escHtml } from './base.ts'

/**
 * Renders a single document in the reader view.
 * html: the pre-rendered HTML from renderMarkdown()
 */
export function renderDoc(doc: KaybeeDoc, html: string): string {
  const folder = doc.folderPath.split('/').at(-1) ?? doc.folderPath
  const updated = formatDate(doc.updatedAt?.toDate?.() ?? new Date())
  const crumbs = buildCrumbs(doc.folderPath)

  const body = `
${topbar({ crumb: doc.title })}

<main class="container">

  <!-- Breadcrumb -->
  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Library</a>
    ${crumbs.map((c) => `<span class="sep">/</span><a href="/search?q=${encodeURIComponent(c.name)}">${escHtml(c.name)}</a>`).join('')}
    <span class="sep">/</span>
    <span class="here">${escHtml(doc.title)}</span>
  </nav>

  <div class="reader-shell">
    <!-- Toolbar -->
    <div class="reader-toolbar">
      <a class="btn" href="/">← Back</a>
      <div class="actions">
        <a
          class="btn"
          href="https://docs.google.com/document/d/${escHtml(doc.driveId)}/edit"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open in Docs
        </a>
      </div>
    </div>

    <!-- Article -->
    <article class="reader-article">
      <header class="reader-header">
        <div class="meta-row">
          <span class="tag tag-blue">${escHtml(folder)}</span>
        </div>
        <h1>${escHtml(doc.title)}</h1>
        <div class="by">
          <span>Updated <b>${updated}</b></span>
          <span class="muted mono">${escHtml(doc.folderPath)}</span>
        </div>
      </header>

      <div class="prose">
        ${html}
      </div>
    </article>
  </div>

</main>

${footer()}`

  return baseShell(doc.title, body)
}

function buildCrumbs(folderPath: string): Array<{ name: string }> {
  return folderPath
    .split('/')
    .filter(Boolean)
    .map((segment) => ({ name: segment }))
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
