import type { KaybeeDoc, CategoryNode } from '../../firestore/docs.ts'
import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { hero } from '../partials/hero.ts'
import { breadcrumb, type BreadcrumbItem } from '../partials/breadcrumb.ts'
import { docCard } from '../partials/doc-card.ts'
import { catTile } from '../partials/cat-tile.ts'
import { escHtml } from '../lib/html.ts'

export function renderCategory(
  parentPath: string,
  subfolders: CategoryNode[],
  docs: KaybeeDoc[],
): string {
  const segments = parentPath.split('/').filter(Boolean)
  const title = segments.at(-1) ?? 'Categories'
  const isRoot = segments.length === 0

  const body = `
${topbar({ crumb: isRoot ? 'Categories' : title })}

<main class="container">

  ${breadcrumb(buildCrumbItems(segments))}

  ${hero({
    eyebrowLeft: 'Categories',
    eyebrowRight: isRoot ? undefined : parentPath,
    titleHtml: isRoot
      ? 'Browse the <em>library</em>.'
      : `Inside <em>${escHtml(title)}</em>.`,
    metaHtml: [
      `<b>${subfolders.length || '—'}</b> subfolder${subfolders.length === 1 ? '' : 's'}`,
      `<b>${docs.length || '—'}</b> doc${docs.length === 1 ? '' : 's'} here`,
    ],
  })}

  ${subfolders.length > 0 ? `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Folders</div>
        <h2>${isRoot ? 'Top-level' : 'Inside ' + escHtml(title)}</h2>
      </div>
    </div>
    <div class="grid-cat">
      ${subfolders.map(catTile).join('')}
    </div>
  </section>` : ''}

  ${docs.length > 0 ? `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Documents</div>
        <h2>In this folder</h2>
      </div>
    </div>
    <div class="grid-3">${docs.map(docCard).join('')}</div>
  </section>` : ''}

  ${subfolders.length === 0 && docs.length === 0 ? `
  <section class="section">
    <p class="empty">This folder is empty.</p>
  </section>` : ''}

</main>

${footer()}`

  return layout({ title: isRoot ? 'Categories' : title, body })
}

function buildCrumbItems(segments: string[]): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    { label: 'Library', href: '/' },
    { label: 'Categories', href: '/cat/' },
  ]
  const acc: string[] = []
  for (let i = 0; i < segments.length; i++) {
    acc.push(segments[i]!)
    const isLast = i === segments.length - 1
    items.push(
      isLast
        ? { label: segments[i]! }
        : { label: segments[i]!, href: `/cat/${encodeURIComponent(acc.join('/'))}` },
    )
  }
  return items
}
