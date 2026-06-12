import type { KaybeeDoc, KaybeeDocVersion } from '../../firestore/docs.ts'
import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { breadcrumb, type BreadcrumbItem } from '../partials/breadcrumb.ts'
import { escHtml } from '../lib/html.ts'
import { formatDateTime } from '../lib/format.ts'
import { diffStats, type DiffLine } from '../lib/diff.ts'

/** Runs of unchanged lines longer than this collapse into a "⋯ n lines" row. */
const CONTEXT_LINES = 3

export function renderHistory(
  doc: KaybeeDoc,
  versions: KaybeeDocVersion[],
): string {
  const docUrl = `/doc/${encodeURIComponent(doc.id)}`
  const crumbs = buildCrumbItems(doc, 'History')

  const rows = versions
    .map((v) => {
      const isCurrent = v.version === (doc.version ?? versions[0]?.version)
      const savedAt = v.savedAt?.toDate?.() ?? new Date()
      const badge = isCurrent
        ? '<span class="tag tag-green">Current</span>'
        : ''
      const renamed =
        v.title !== doc.title
          ? `<span class="sub">as “${escHtml(v.title)}”</span>`
          : `<span class="sub">${escHtml(v.folderPath)}</span>`
      const changesLink =
        v.version > 1
          ? `<a class="btn" href="${docUrl}/diff/${v.version}">Changes</a>`
          : '<span class="tag tag-yellow">Created</span>'
      const viewLink = isCurrent
        ? `<a class="btn" href="${docUrl}">View</a>`
        : `<a class="btn" href="${docUrl}/v/${v.version}">View</a>`

      return `
      <div class="version-row">
        <span class="version-no mono">v${v.version}</span>
        <div class="version-meta">
          <span class="title">${escHtml(formatDateTime(savedAt))}</span>
          ${renamed}
        </div>
        ${badge}
        <div class="version-actions">${changesLink}${viewLink}</div>
      </div>`
    })
    .join('')

  const body = `
${topbar()}

<main class="container">

  ${breadcrumb(crumbs)}

  <div class="reader-shell">
    <div class="reader-toolbar">
      <a class="btn" href="${docUrl}">← Back to doc</a>
    </div>

    <article class="reader-article">
      <header class="reader-header">
        <div class="eyebrow">Version history</div>
        <h1>${escHtml(doc.title)}</h1>
        <div class="by">
          <small><b>${versions.length}</b> saved version${versions.length === 1 ? '' : 's'} —
          a new one is kept every time the synced content changes.</small>
        </div>
      </header>

      ${
        versions.length > 0
          ? `<div class="version-list">${rows}</div>`
          : `<p class="empty">No versions recorded yet. History starts with the next sync of this doc.</p>`
      }
    </article>
  </div>

</main>

${footer()}`

  return layout({ title: `History · ${doc.title}`, body })
}

export function renderDiff(
  doc: KaybeeDoc,
  from: KaybeeDocVersion,
  to: KaybeeDocVersion,
  lines: DiffLine[],
): string {
  const docUrl = `/doc/${encodeURIComponent(doc.id)}`
  const crumbs = buildCrumbItems(doc, `v${from.version} → v${to.version}`)
  const stats = diffStats(lines)
  const savedAt = to.savedAt?.toDate?.() ?? new Date()

  const body = `
${topbar()}

<main class="container">

  ${breadcrumb(crumbs)}

  <div class="reader-shell">
    <div class="reader-toolbar">
      <a class="btn" href="${docUrl}/history">← All versions</a>
      <div class="actions">
        ${from.version > 1 ? `<a class="btn" href="${docUrl}/diff/${from.version}">← v${from.version}</a>` : ''}
        ${to.version < (doc.version ?? to.version) ? `<a class="btn" href="${docUrl}/diff/${to.version + 1}">v${to.version + 1} →</a>` : ''}
      </div>
    </div>

    <article class="reader-article">
      <header class="reader-header">
        <div class="eyebrow">Changes in version ${to.version}</div>
        <h1>${escHtml(doc.title)}</h1>
        <div class="by">
          <small>Saved <b>${escHtml(formatDateTime(savedAt))}</b> — compared with version ${from.version}</small>
          <small class="mono"><span class="diff-stat-add">+${stats.added}</span> <span class="diff-stat-del">−${stats.removed}</span></small>
        </div>
      </header>

      ${
        stats.added === 0 && stats.removed === 0
          ? '<p class="empty">No text changes — likely a move or rename.</p>'
          : `<pre class="diff">${renderDiffLines(lines)}</pre>`
      }
    </article>
  </div>

</main>

${footer()}`

  return layout({ title: `Changes v${to.version} · ${doc.title}`, body })
}

/**
 * Diff lines → HTML, collapsing long unchanged runs but keeping
 * CONTEXT_LINES of context around every change.
 */
function renderDiffLines(lines: DiffLine[]): string {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]!
    if (l.type !== 'same') {
      out.push(diffLineHtml(l))
      i++
      continue
    }

    // Measure this unchanged run.
    let runEnd = i
    while (runEnd < lines.length && lines[runEnd]!.type === 'same') runEnd++
    const runLen = runEnd - i
    const isFirst = i === 0
    const isLast = runEnd === lines.length
    const keepHead = isFirst ? 0 : CONTEXT_LINES
    const keepTail = isLast ? 0 : CONTEXT_LINES

    if (runLen <= keepHead + keepTail + 2) {
      for (let k = i; k < runEnd; k++) out.push(diffLineHtml(lines[k]!))
    } else {
      for (let k = i; k < i + keepHead; k++) out.push(diffLineHtml(lines[k]!))
      const hidden = runLen - keepHead - keepTail
      out.push(`<span class="diff-line diff-skip">⋯ ${hidden} unchanged line${hidden === 1 ? '' : 's'}</span>`)
      for (let k = runEnd - keepTail; k < runEnd; k++) out.push(diffLineHtml(lines[k]!))
    }
    i = runEnd
  }
  return out.join('')
}

function diffLineHtml(l: DiffLine): string {
  const cls = l.type === 'add' ? 'diff-add' : l.type === 'del' ? 'diff-del' : ''
  const sign = l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '
  return `<span class="diff-line ${cls}"><span class="diff-sign">${sign}</span>${escHtml(l.line) || ' '}</span>`
}

function buildCrumbItems(doc: KaybeeDoc, leaf: string): BreadcrumbItem[] {
  return [
    { label: 'Library', href: '/' },
    { label: doc.title, href: `/doc/${encodeURIComponent(doc.id)}` },
    { label: leaf },
  ]
}
