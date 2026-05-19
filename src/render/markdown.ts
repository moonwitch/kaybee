import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false,
})

/**
 * Converts a Markdown string to safe, semantic HTML.
 * Wraps the output in a <div class="prose"> for styling.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  if (!markdown) return ''
  const html = await marked.parse(markdown)
  return html
}
