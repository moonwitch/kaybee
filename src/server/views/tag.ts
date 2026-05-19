import type { KaybeeDoc } from '../../firestore/docs.ts'
import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { hero } from '../partials/hero.ts'
import { breadcrumb } from '../partials/breadcrumb.ts'
import { docCard } from '../partials/doc-card.ts'
import { escHtml } from '../lib/html.ts'

export function renderTag(tag: string, docs: KaybeeDoc[]): string {
  const body = `
${topbar({ crumb: `#${tag}` })}

<main class="container">

  ${breadcrumb([
    { label: 'Library', href: '/' },
    { label: `#${tag}` },
  ])}

  ${hero({
    eyebrowLeft: 'Tag',
    eyebrowRight: `#${tag}`,
    titleHtml: `Everything tagged <em>#${escHtml(tag)}</em>.`,
    metaHtml: [`<b>${docs.length || '—'}</b> result${docs.length === 1 ? '' : 's'}`],
  })}

  <section class="section">
    ${
      docs.length === 0
        ? `<p class="empty">No docs tagged <code>#${escHtml(tag)}</code> yet.</p>`
        : `<div class="grid-3">${docs.map(docCard).join('')}</div>`
    }
  </section>

</main>

${footer()}`

  return layout({ title: `#${tag}`, body })
}
