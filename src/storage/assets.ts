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

/** Guardrail for inline images — Docs can embed surprisingly large pastes. */
const MAX_INLINE_IMAGE_BYTES = 15 * 1024 * 1024

/**
 * Re-hosts every image a Google Doc export can emit onto GCS, so the
 * Markdown stored in Firestore contains only small /a/<hash>.<ext> URLs:
 *
 *  1. base64 `data:image/...` URIs (how the export embeds most pasted
 *     images) — decoded and uploaded
 *  2. remote URLs in both `![alt](https://…)` and `<img src="https://…">`
 *     form (googleusercontent links need a Drive bearer token; the export
 *     uses <img> tags when an image has explicit sizing) — fetched and
 *     uploaded
 *  3. anything inline that survived (oversized, undecodable) is stripped —
 *     base64 must never reach Firestore (doc-size and token-limit guardrail)
 */
export async function rewriteImageUrls(markdown: string): Promise<string> {
  markdown = await rehostInlineImages(markdown)
  markdown = await rehostRemoteImages(markdown)
  return stripDataUriImages(markdown)
}

/**
 * Decode + upload every base64 image data URI, then swap all occurrences
 * for the hosted URL. Syntax-agnostic on purpose: the same replacement
 * covers `![…](data:…)` and `<img src="data:…">` alike.
 */
async function rehostInlineImages(markdown: string): Promise<string> {
  const uris = new Set<string>(
    markdown.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi) ?? [],
  )

  for (const uri of uris) {
    const hosted = await uploadDataUri(uri)
    if (hosted) markdown = markdown.split(uri).join(hosted)
  }
  return markdown
}

async function uploadDataUri(uri: string): Promise<string | null> {
  const m = uri.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!m) return null
  try {
    const buffer = Buffer.from(m[2]!, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_INLINE_IMAGE_BYTES) {
      console.warn(
        `[assets] Dropped inline image (${buffer.length} bytes, limit ${MAX_INLINE_IMAGE_BYTES})`,
      )
      return null
    }
    return await uploadAsset(buffer, m[1]!.toLowerCase())
  } catch (err) {
    console.error('[assets] Failed to re-host inline image:', err)
    return null
  }
}

/**
 * Download remote images via the authenticated Drive scope and re-host
 * them on GCS. Covers Markdown image syntax and HTML <img> tags; each
 * distinct URL is fetched once.
 */
async function rehostRemoteImages(markdown: string): Promise<string> {
  const mdMatches = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)]
  const imgMatches = [...markdown.matchAll(/<img\b[^>]*?\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi)]

  const hosted = new Map<string, string | null>()
  const hostRemote = async (url: string): Promise<string | null> => {
    if (hosted.has(url)) return hosted.get(url)!
    let result: string | null = null
    try {
      const response = await fetchAuthed(url)
      const mimeType = response.headers.get('content-type') ?? ''
      if (!response.ok) {
        console.warn(`[assets] Skipped ${url} (status ${response.status})`)
      } else if (!mimeType.startsWith('image/')) {
        console.warn(`[assets] Skipped ${url} (not an image: ${mimeType || 'no content-type'})`)
      } else {
        const buffer = Buffer.from(await response.arrayBuffer())
        result = await uploadAsset(buffer, mimeType)
      }
    } catch (err) {
      console.error(`[assets] Failed to rewrite image ${url}:`, err)
    }
    hosted.set(url, result)
    return result
  }

  for (const [full, alt, url] of mdMatches) {
    const newUrl = await hostRemote(url!)
    if (newUrl) markdown = markdown.replace(full!, `![${alt ?? ''}](${newUrl})`)
  }
  for (const [full, url] of imgMatches) {
    const newUrl = await hostRemote(url!)
    if (newUrl) markdown = markdown.replace(full!, full!.split(url!).join(newUrl))
  }
  return markdown
}

/**
 * Final guardrail: remove any image still carrying a data: URI (oversized
 * or undecodable above) in either Markdown or <img> form.
 */
export function stripDataUriImages(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\(data:[^)]*\)/g, '')
    .replace(/<img\b[^>]*?\bsrc=["']data:[^"']*["'][^>]*>/gi, '')
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
