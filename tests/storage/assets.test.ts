import { test, expect } from 'bun:test'
import { serveAsset, rewriteImageUrls } from '../../src/storage/assets.ts'

test('serveAsset rejects path traversal', async () => {
  const res = await serveAsset('../etc/passwd')
  expect(res.status).toBe(400)
})

test('serveAsset rejects unhashed filenames', async () => {
  const res = await serveAsset('foo.png')
  expect(res.status).toBe(400)
})

test('serveAsset rejects names with slashes', async () => {
  const res = await serveAsset('abc/def.png')
  expect(res.status).toBe(400)
})

test('serveAsset rejects names missing an extension', async () => {
  const hash = 'a'.repeat(64)
  const res = await serveAsset(hash)
  expect(res.status).toBe(400)
})

test('rewriteImageUrls leaves data: URLs alone (already stripped upstream)', async () => {
  const input = 'before ![a](data:image/png;base64,xxx) after'
  const result = await rewriteImageUrls(input)
  expect(result).toBe(input)
})

test('rewriteImageUrls leaves relative /a/ URLs untouched', async () => {
  const input = '![a](/a/' + 'a'.repeat(64) + '.png)'
  const result = await rewriteImageUrls(input)
  expect(result).toBe(input)
})

test('rewriteImageUrls leaves text without images untouched', async () => {
  const input = '# heading\n\nSome paragraph with no images.'
  const result = await rewriteImageUrls(input)
  expect(result).toBe(input)
})
