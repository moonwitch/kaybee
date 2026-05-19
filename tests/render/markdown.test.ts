import { test, expect } from 'bun:test'
import { renderMarkdown } from '../../src/render/markdown.ts'

test('renders a heading', async () => {
  const html = await renderMarkdown('# Hello')
  expect(html).toContain('<h1')
  expect(html).toContain('Hello')
})

test('renders a paragraph', async () => {
  const html = await renderMarkdown('Just some text.')
  expect(html).toContain('<p>')
  expect(html).toContain('Just some text.')
})

test('returns empty string for empty input', async () => {
  const html = await renderMarkdown('')
  expect(html).toBe('')
})

test('renders bold and italic', async () => {
  const html = await renderMarkdown('**bold** and *italic*')
  expect(html).toContain('<strong>')
  expect(html).toContain('<em>')
})
