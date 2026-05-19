import {
  exportDocAsMarkdown,
  getFileMeta,
  resolveFolderPath,
} from '../drive/exporter.ts'
import { upsertDoc } from '../firestore/docs.ts'
import { rewriteImageUrls } from '../storage/assets.ts'

/**
 * POST /sync/:docId
 *
 * Called by n8n when Google Drive detects a file change.
 * Expected header: X-Sync-Secret: <SYNC_SECRET env var>
 *
 * Body (optional): { docId, folderId }
 */
export async function syncHandler(
  req: Request,
  docId: string,
): Promise<Response> {
  // Validate shared secret
  const secret = req.headers.get('X-Sync-Secret')
  if (secret !== process.env.SYNC_SECRET) {
    console.warn(`[sync] Unauthorised request for docId=${docId}`)
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`[sync] Starting sync for docId=${docId}`)
  const start = Date.now()

  try {
    // 1. Fetch doc metadata and export Markdown (base64 stripped inside exporter)
    const [meta, markdown] = await Promise.all([
      getFileMeta(docId),
      exportDocAsMarkdown(docId),
    ])

    // 2. Resolve the folder path (for navigation + categories)
    const folderPath = await resolveFolderPath(docId)

    // 3. Rewrite Drive image URLs → GCS (best-effort; errors are logged, not fatal)
    const cleanedMarkdown = await rewriteImageUrls(markdown)

    // 4. Upsert to Firestore
    await upsertDoc({
      id: docId,
      driveId: docId,
      title: meta.title,
      folderPath,
      markdown: cleanedMarkdown,
    })

    const ms = Date.now() - start
    console.log(`[sync] Done docId=${docId} title="${meta.title}" in ${ms}ms`)

    return new Response(
      JSON.stringify({ ok: true, docId, title: meta.title, ms }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sync] Error syncing docId=${docId}:`, err)

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
