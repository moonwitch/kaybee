import { test, expect, beforeAll } from 'bun:test'
import { router } from '../../src/server/routes.ts'

beforeAll(() => {
  process.env.SYNC_SECRET = 'test-secret'
})

test('returns 404 for unknown paths', async () => {
  const req = new Request('http://localhost/does-not-exist')
  const res = await router(req)
  expect(res.status).toBe(404)
})

test('rejects malformed asset filenames with 400', async () => {
  const req = new Request('http://localhost/a/not-a-hash.png')
  const res = await router(req)
  expect(res.status).toBe(400)
})

test('rejects asset path traversal with 400', async () => {
  const req = new Request('http://localhost/a/..%2Fetc%2Fpasswd')
  const res = await router(req)
  expect(res.status).toBe(400)
})

test('rejects sync requests with wrong secret', async () => {
  const req = new Request('http://localhost/sync/abc123', {
    method: 'POST',
    headers: { 'X-Sync-Secret': 'wrong' },
  })
  const res = await router(req)
  expect(res.status).toBe(401)
})
