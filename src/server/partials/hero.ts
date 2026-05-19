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
  /** When true, render an inline SVG gradient as a backdrop behind the text */
  backdrop?: boolean
}

export function hero(opts: HeroOpts): string {
  const cls = opts.backdrop ? 'hero has-backdrop' : 'hero'
  return `<section class="${cls}">
  ${opts.backdrop ? heroBackdrop() : ''}
  <div class="hero-content">
    <div class="hero-top">
      <small>${escHtml(opts.eyebrowLeft)}</small>
      ${opts.eyebrowRight ? `<span class="hero-divider" aria-hidden="true"></span><small>${escHtml(opts.eyebrowRight)}</small>` : ''}
    </div>
    <h1>${opts.titleHtml}</h1>
    <ul class="hero-meta">
      ${opts.metaHtml.map((m) => `<li>${m}</li>`).join('')}
    </ul>
  </div>
</section>`
}

function heroBackdrop(): string {
  return `<svg class="hero-backdrop" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="hero-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="var(--yellow)" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="var(--orange)" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="var(--red)" stop-opacity="0.40"/>
    </linearGradient>
    <radialGradient id="hero-glow" cx="20%" cy="20%" r="60%">
      <stop offset="0%" stop-color="var(--paper)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="var(--paper)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="360" fill="url(#hero-grad)"/>
  <rect width="1200" height="360" fill="url(#hero-glow)"/>
</svg>`
}
