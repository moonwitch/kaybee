import type { KaybeeDoc } from '../../firestore/docs.ts'
import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { breadcrumb, type BreadcrumbItem } from '../partials/breadcrumb.ts'
import { escHtml } from '../lib/html.ts'
import { formatDate, formatDateTime, mimeLabel, driveEditUrl } from '../lib/format.ts'

export interface DocViewOptions {
  /** Set when rendering an old snapshot from /doc/:id/v/:n. */
  viewingVersion?: {
    version: number
    savedAt: Date
    currentVersion: number
  }
}

export function renderDoc(
  doc: KaybeeDoc,
  html: string,
  opts: DocViewOptions = {},
): string {
  const folder = doc.folderPath.split('/').at(-1) ?? doc.folderPath
  const updatedAt = doc.updatedAt?.toDate?.() ?? new Date()
  const tags = doc.tags ?? []
  const crumbs = buildCrumbItems(doc.folderPath, doc.title)
  const editUrl = driveEditUrl(doc.mimeType, doc.driveId)
  const editLabel = `Open in ${mimeLabel(doc.mimeType) || 'Drive'}`
  const old = opts.viewingVersion

  const versionBanner = old
    ? `
    <div class="version-banner">
      <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
      <span>
        Viewing <b>version ${old.version}</b> saved ${escHtml(formatDateTime(old.savedAt))}
        — the current page is version ${old.currentVersion}.
      </span>
      <a class="btn" href="/doc/${encodeURIComponent(doc.id)}">View current</a>
    </div>`
    : ''

  const body = `
${topbar()}

<main class="container">

  ${breadcrumb(crumbs)}

  <div class="reader-shell">
    <div class="reader-toolbar">
      <a class="btn" href="/">← Back</a>
      <div class="actions">
        <a class="btn" href="/doc/${encodeURIComponent(doc.id)}/history">
          <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          History
        </a>
        <a
          class="btn"
          href="${escHtml(editUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          ${escHtml(editLabel)}
        </a>
      </div>
    </div>

    ${versionBanner}

    <article class="reader-article">
      <header class="reader-header">
        <div class="meta-row">
          <span class="tag tag-blue">${escHtml(folder)}</span>
          ${tags.map((t) => `<a class="tag" href="/tag/${encodeURIComponent(t)}">${escHtml(t)}</a>`).join('')}
        </div>
        <h1>${escHtml(doc.title)}</h1>
        <div class="by">
          <small>Updated <time datetime="${updatedAt.toISOString()}"><b>${formatDate(updatedAt)}</b></time></small>
          <small class="muted mono">${escHtml(doc.folderPath)}</small>
        </div>
      </header>

      <div class="prose">
        ${html}
      </div>
    </article>
  </div>

</main>

${footer()}`

  return layout({ title: doc.title, body })
}

function buildCrumbItems(folderPath: string, title: string): BreadcrumbItem[] {
  const segments = folderPath.split('/').filter(Boolean)
  const items: BreadcrumbItem[] = [
    { label: 'Library', href: '/' },
    { label: 'Categories', href: '/cat/' },
  ]
  const acc: string[] = []
  for (const seg of segments) {
    acc.push(seg)
    items.push({ label: seg, href: `/cat/${encodeURIComponent(acc.join('/'))}` })
  }
  items.push({ label: title })
  return items
}
