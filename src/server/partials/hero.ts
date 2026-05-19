import { escHtml } from '../lib/html.ts'

export interface HeroOpts {
  /** Left chip in the eyebrow row (plain text) */
  eyebrowLeft: string
  /** Optional right chip in the eyebrow row (plain text) */
  eyebrowRight?: string
  /** Title — caller is responsible for escaping; allows inline <em> etc. */
  titleHtml: string
  /** Each meta item is a pre-rendered HTML snippet (caller escapes) */
  metaHtml: string[]
  /** Whether to render the grey hero image placeholder above the eyebrow */
  showImagePlaceholder?: boolean
}

export function hero(opts: HeroOpts): string {
  return `<section class="hero">
  ${opts.showImagePlaceholder ? '<div class="hero-image-placeholder" aria-hidden="true"></div>' : ''}
  <div class="hero-top">
    <small>${escHtml(opts.eyebrowLeft)}</small>
    ${opts.eyebrowRight ? `<span class="hero-divider" aria-hidden="true"></span><small>${escHtml(opts.eyebrowRight)}</small>` : ''}
  </div>
  <h1>${opts.titleHtml}</h1>
  <ul class="hero-meta">
    ${opts.metaHtml.map((m) => `<li>${m}</li>`).join('')}
  </ul>
</section>`
}
