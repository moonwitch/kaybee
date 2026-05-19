import { escHtml } from '../lib/html.ts'

export interface BreadcrumbItem {
  label: string
  /** If omitted, the item renders as the current page (aria-current="page"). */
  href?: string
}

export function breadcrumb(items: BreadcrumbItem[]): string {
  if (items.length === 0) return ''
  const lis = items.map((item) => {
    const content = item.href
      ? `<a href="${item.href}">${escHtml(item.label)}</a>`
      : escHtml(item.label)
    const aria = item.href ? '' : ' aria-current="page"'
    return `<li${aria}>${content}</li>`
  })
  return `<nav class="crumb" aria-label="Breadcrumb"><ol>${lis.join('')}</ol></nav>`
}
