import { test, expect, beforeAll } from 'bun:test'
import { syncHandler } from '../../src/sync/handler.ts'

beforeAll(() => {
  process.env.SYNC_SECRET = 'test-secret'
})

test('rejects requests with missing X-Sync-Secret header', async () => {
  const req = new Request('http://localhost/sync/abc123', { method: 'POST' })
  const res = await syncHandler(req, 'abc123')

  expect(res.status).toBe(401)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('Unauthorised')
})

test('rejects requests with wrong X-Sync-Secret value', async () => {
  const req = new Request('http://localhost/sync/abc123', {
    method: 'POST',
    headers: { 'X-Sync-Secret': 'wrong-secret' },
  })
  const res = await syncHandler(req, 'abc123')

  expect(res.status).toBe(401)
})
