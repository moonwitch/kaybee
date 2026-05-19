import type { KaybeeDoc } from '../../firestore/docs.ts'
import { escHtml } from '../lib/html.ts'
import { formatDate, mimeLabel } from '../lib/format.ts'

const MAX_TAGS = 2

export function docCard(doc: KaybeeDoc): string {
  const excerpt = doc.markdown.replace(/[#*`>\[\]]/g, '').trim().slice(0, 120)
  const updated = doc.updatedAt?.toDate?.() ?? new Date()
  const folder = doc.folderPath.split('/').at(-1) ?? doc.folderPath
  const kind = mimeLabel(doc.mimeType)
  const tags = (doc.tags ?? []).slice(0, MAX_TAGS)

  return `<a class="doc-card" href="/doc/${escHtml(doc.id)}">
  <div class="top">
    <span class="tag tag-blue">${escHtml(folder)}</span>
    ${kind ? `<span class="tag">${escHtml(kind)}</span>` : ''}
    ${tags.map((t) => `<span class="tag">${escHtml(t)}</span>`).join('')}
  </div>
  <h3>${escHtml(doc.title)}</h3>
  <p class="excerpt">${escHtml(excerpt)}</p>
  <div class="foot">
    <time datetime="${updated.toISOString()}">${formatDate(updated)}</time>
  </div>
</a>`
}
