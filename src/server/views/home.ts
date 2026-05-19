import type { KaybeeDoc, CategoryNode } from '../../firestore/docs.ts'
import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { hero } from '../partials/hero.ts'
import { docCard } from '../partials/doc-card.ts'
import { catTile } from '../partials/cat-tile.ts'
import { escHtml } from '../lib/html.ts'

export function renderHome(
  recent: KaybeeDoc[],
  topCategories: CategoryNode[],
  searchResults: KaybeeDoc[],
  query: string,
): string {
  const isSearch = query.length > 0

  const body = `
${topbar({ query })}

<main class="container">

  ${hero({
    eyebrowLeft: 'Loop · Library',
    eyebrowRight: String(new Date().getFullYear()),
    titleHtml: isSearch
      ? `Results for <em>${escHtml(query)}</em>`
      : 'Everything the team <em>knows</em>, in one place.',
    metaHtml: [
      `<b>${recent.length > 0 ? recent.length + '+' : '—'}</b> docs`,
      `<b>${topCategories.length || '—'}</b> categories`,
      'synced from Google Drive',
    ],
    showImagePlaceholder: true,
  })}

  ${isSearch ? searchSection(searchResults, query) : homeContent(recent, topCategories)}

</main>

${footer()}`

  return layout({ title: isSearch ? `Search: ${query}` : 'Home', body })
}

function homeContent(recent: KaybeeDoc[], categories: CategoryNode[]): string {
  return `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Recent</div>
        <h2>Just updated</h2>
      </div>
    </div>
    ${recent.length === 0 ? emptyState('No documents yet. Sync one from Drive to get started.') : `<div class="grid-3">${recent.map(docCard).join('')}</div>`}
  </section>

  ${categories.length > 0 ? `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Browse</div>
        <h2>Categories</h2>
      </div>
      <a class="btn" href="/cat/">All folders →</a>
    </div>
    <div class="grid-cat">
      ${categories.map(catTile).join('')}
    </div>
  </section>` : ''}
  `
}

function searchSection(results: KaybeeDoc[], query: string): string {
  if (results.length === 0) {
    return `<section class="section">${emptyState(`No results for "${query}". Try a different word.`)}</section>`
  }
  return `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Search</div>
        <h2>${results.length} result${results.length === 1 ? '' : 's'}</h2>
      </div>
    </div>
    <div class="grid-3">${results.map(docCard).join('')}</div>
  </section>`
}

function emptyState(message: string): string {
  return `<p class="empty">${escHtml(message)}</p>`
}
