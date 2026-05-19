import type { KaybeeDoc, Category } from '../../firestore/docs.ts'
import { baseShell, topbar, footer, escHtml } from './base.ts'

/** Accent colours cycled across category tiles */
const SWATCH_COLOURS = [
  'var(--blue)',
  'var(--green)',
  'var(--orange)',
  'var(--purple)',
  'var(--red)',
  'var(--yellow)',
]

export function renderHome(
  recent: KaybeeDoc[],
  categories: Category[],
  searchResults: KaybeeDoc[],
  query: string,
): string {
  const isSearch = query.length > 0

  const body = `
${topbar({ query })}

<main class="container">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-image-placeholder"></div>
    <div class="hero-top">
      <span>Loop · Library</span>
      <span class="hero-divider"></span>
      <span>${new Date().getFullYear()}</span>
    </div>
    <h1>${isSearch ? `Results for <em>${escHtml(query)}</em>` : 'Everything the team <em>knows</em>, in one place.'}</h1>
    <div class="hero-meta">
      <span><b>${recent.length > 0 ? recent.length + '+' : '—'}</b> docs</span>
      <span><b>${categories.length || '—'}</b> categories</span>
      <span>synced from Google Drive</span>
    </div>
  </div>

  ${isSearch ? searchSection(searchResults, query) : homeContent(recent, categories)}

</main>

${footer()}`

  return baseShell(isSearch ? `Search: ${query}` : 'Home', body)
}

function homeContent(recent: KaybeeDoc[], categories: Category[]): string {
  return `
  <!-- Recent docs -->
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Recent</div>
        <h2>Just updated</h2>
      </div>
    </div>
    ${recent.length === 0 ? emptyState('No documents yet. Sync one from Drive to get started.') : `<div class="grid-3">${recent.map(docCard).join('')}</div>`}
  </section>

  <!-- Categories -->
  ${categories.length > 0 ? `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="eyebrow">Browse</div>
        <h2>Categories</h2>
      </div>
    </div>
    <div class="grid-cat">
      ${categories.map((c, i) => categoryTile(c, i)).join('')}
    </div>
  </section>` : ''}
  `
}

function searchSection(results: KaybeeDoc[], query: string): string {
  if (results.length === 0) {
    return `<section class="section">${emptyState(`No results for "${escHtml(query)}". Try a different word.`)}</section>`
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

function docCard(doc: KaybeeDoc): string {
  const excerpt = doc.markdown.replace(/[#*`>\[\]]/g, '').trim().slice(0, 120)
  const updated = formatDate(doc.updatedAt?.toDate?.() ?? new Date())
  const folder = doc.folderPath.split('/').at(-1) ?? doc.folderPath

  return `<a class="doc-card" href="/doc/${escHtml(doc.id)}" style="text-decoration:none;">
  <div class="top">
    <span class="tag tag-blue">${escHtml(folder)}</span>
  </div>
  <h3>${escHtml(doc.title)}</h3>
  <p class="excerpt">${escHtml(excerpt)}</p>
  <div class="foot">
    <span>${updated}</span>
  </div>
</a>`
}

function categoryTile(cat: Category, index: number): string {
  const colour = SWATCH_COLOURS[index % SWATCH_COLOURS.length]!
  const initial = cat.name.charAt(0).toUpperCase()

  return `<a class="cat-tile" href="/search?q=${encodeURIComponent(cat.name)}" style="text-decoration:none;">
  <span class="swatch" style="background:${colour}">${escHtml(initial)}</span>
  <h3>${escHtml(cat.name)}</h3>
  <p class="desc">${escHtml(cat.path)}</p>
  <div class="meta">
    <span>${cat.docCount} doc${cat.docCount === 1 ? '' : 's'}</span>
    <span class="arrow">→</span>
  </div>
</a>`
}

function emptyState(message: string): string {
  return `<p class="muted" style="padding: 32px 0;">${escHtml(message)}</p>`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
