import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { hero } from '../partials/hero.ts'
import { escHtml } from '../lib/html.ts'

export interface ErrorOpts {
  code: number
  title: string
  message: string
}

export function renderError(opts: ErrorOpts): string {
  const body = `
${topbar({ crumb: String(opts.code) })}

<main class="container">

  ${hero({
    eyebrowLeft: `Error ${opts.code}`,
    titleHtml: escHtml(opts.title),
    metaHtml: [escHtml(opts.message)],
  })}

  <section class="section">
    <p>
      <a class="btn" href="/">← Back to library</a>
    </p>
  </section>

</main>

${footer()}`

  return layout({ title: `${opts.code} · ${opts.title}`, body })
}
