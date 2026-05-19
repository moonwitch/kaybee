import { Storage } from '@google-cloud/storage'
import { google } from 'googleapis'
import crypto from 'node:crypto'

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

let _bucket: ReturnType<Storage['bucket']> | null = null

function getBucket(): ReturnType<Storage['bucket']> {
  if (!_bucket) {
    const name = process.env.GCS_BUCKET
    if (!name) throw new Error('GCS_BUCKET environment variable is not set')
    _bucket = new Storage().bucket(name)
  }
  return _bucket
}

/**
 * Uploads a Buffer to GCS at /a/<sha256-hex>.<ext>.
 * Bucket has public-access-prevention enforced — objects stay private and
 * are served via the /a/:filename Cloud Run proxy route.
 * Returns the relative URL (/a/<hash>.<ext>).
 */
export async function uploadAsset(
  data: Buffer,
  mimeType: string,
): Promise<string> {
  const bucket = getBucket()
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  const ext = extForMime(mimeType)
  const destination = `a/${hash}.${ext}`

  const file = bucket.file(destination)
  const [exists] = await file.exists()

  if (!exists) {
    await file.save(data, {
      contentType: mimeType,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    })
  }

  return `/${destination}`
}

/**
 * Rewrites image URLs in Markdown by downloading each image via the
 * authenticated Drive scope and re-hosting it on GCS.
 *
 * Drive's markdown export emits googleusercontent.com URLs that require
 * a Drive-API bearer token — anonymous fetch returns 401/403.
 *
 * Skips data: URLs (should have been stripped already) and URLs already
 * pointing at the local /a/ asset path.
 */
export async function rewriteImageUrls(markdown: string): Promise<string> {
  const pattern = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  const matches = [...markdown.matchAll(pattern)]

  for (const match of matches) {
    const [full, alt, url] = match
    if (!url || url.startsWith('data:')) continue

    try {
      const response = await fetchAuthed(url)
      if (!response.ok) {
        console.warn(`[assets] Skipped ${url} (status ${response.status})`)
        continue
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const mimeType = response.headers.get('content-type') ?? 'image/png'
      const newUrl = await uploadAsset(buffer, mimeType)

      markdown = markdown.replace(full, `![${alt ?? ''}](${newUrl})`)
    } catch (err) {
      console.error(`[assets] Failed to rewrite image ${url}:`, err)
    }
  }

  return markdown
}

/**
 * Fetches a URL with a Google OAuth bearer token (drive.readonly scope).
 * Falls back to unauthenticated fetch only if the SA cannot mint a token,
 * which usually indicates a misconfigured environment rather than a public
 * resource — but the caller will see the original error in that case.
 */
async function fetchAuthed(url: string): Promise<Response> {
  const client = await auth.getClient()
  const tokenResponse = await client.getAccessToken()
  const token = tokenResponse.token
  if (!token) throw new Error('Failed to obtain Drive access token')

  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

/**
 * Streams a content-addressed asset from the private GCS bucket.
 * Filename must match <64-hex>.<short-ext> to avoid path traversal.
 * Returns 400 on a malformed name, 404 if the object is missing.
 */
export async function serveAsset(filename: string): Promise<Response> {
  if (!/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/i.test(filename)) {
    return new Response('Bad request', { status: 400 })
  }

  const bucket = getBucket()
  const file = bucket.file(`a/${filename}`)
  const [exists] = await file.exists()
  if (!exists) return new Response('Not found', { status: 404 })

  const [data] = await file.download()
  const [meta] = await file.getMetadata()

  return new Response(data, {
    headers: {
      'Content-Type': meta.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

function extForMime(mimeType: string): string {
  const sub = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase() ?? 'bin'
  if (sub === 'jpeg') return 'jpg'
  if (sub === 'svg+xml') return 'svg'
  return sub.replace(/[^a-z0-9]/g, '') || 'bin'
}
