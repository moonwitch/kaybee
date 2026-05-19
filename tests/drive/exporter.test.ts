import { test, expect } from 'bun:test'
import { stripBase64Images } from '../../src/drive/exporter.ts'

test('strips base64 image from markdown', () => {
  const input = 'Before\n![alt](data:image/png;base64,abc123==)\nAfter'
  const result = stripBase64Images(input)
  expect(result).not.toContain('data:image')
  expect(result).toContain('Before')
  expect(result).toContain('After')
})

test('leaves normal image URLs untouched', () => {
  const input = '![logo](https://example.com/logo.png)'
  const result = stripBase64Images(input)
  expect(result).toBe(input)
})

test('leaves GCS image URLs untouched', () => {
  const input = '![img](https://storage.googleapis.com/bucket/a/abc.png)'
  const result = stripBase64Images(input)
  expect(result).toBe(input)
})

test('handles multiple base64 images', () => {
  const input = [
    '![a](data:image/jpeg;base64,xxxxx)',
    '## Section',
    '![b](data:image/png;base64,yyyyy)',
  ].join('\n')

  const result = stripBase64Images(input)
  expect(result).not.toContain('data:')
  expect(result).toContain('## Section')
})

test('handles empty string', () => {
  expect(stripBase64Images('')).toBe('')
})
