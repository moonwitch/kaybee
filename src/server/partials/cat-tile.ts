import type { CategoryNode } from '../../firestore/docs.ts'
import { escHtml } from '../lib/html.ts'

const SWATCH_COLOURS = [
  'var(--blue)',
  'var(--green)',
  'var(--orange)',
  'var(--purple)',
  'var(--red)',
  'var(--yellow)',
]

export function catTile(cat: CategoryNode, index: number): string {
  const colour = SWATCH_COLOURS[index % SWATCH_COLOURS.length]!
  const initial = cat.name.charAt(0).toUpperCase()

  return `<a class="cat-tile" href="/cat/${encodeURIComponent(cat.path)}">
  <span class="swatch" style="background:${colour}" aria-hidden="true">${escHtml(initial)}</span>
  <h3>${escHtml(cat.name)}</h3>
  <p class="desc">${escHtml(cat.path)}</p>
  <div class="meta">
    <small>${cat.docCount} doc${cat.docCount === 1 ? '' : 's'}</small>
    <span class="arrow" aria-hidden="true">→</span>
  </div>
</a>`
}
