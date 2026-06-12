import {
  exportFileAsMarkdown,
  getFileMeta,
  resolveFolderPath,
  isSupported,
  MIME,
} from '../drive/exporter.ts'
import { listAllFiles } from '../drive/indexer.ts'
import { upsertDoc } from '../firestore/docs.ts'
import { rewriteImageUrls } from '../storage/assets.ts'

/**
 * POST /sync/:docId — single-file sync triggered by n8n.
 * Validates the X-Sync-Secret header.
 */
export async function syncHandler(
  req: Request,
  fileId: string,
): Promise<Response> {
  if (!authorised(req)) return unauthorised(fileId)

  console.log(`[sync] Starting sync for fileId=${fileId}`)
  const start = Date.now()

  try {
    const result = await syncOne(fileId)
    const ms = Date.now() - start
    console.log(
      `[sync] Done fileId=${fileId} title="${result.title}" ` +
        `version=${result.version} changed=${result.changed} in ${ms}ms`,
    )
    return jsonOk({
      ok: true,
      fileId,
      title: result.title,
      version: result.version,
      changed: result.changed,
      ms,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sync] Error syncing fileId=${fileId}:`, err)
    return jsonError(message, 500)
  }
}

/**
 * POST /reindex — full sweep of ROOT_FOLDER_ID.
 * Lists every supported file recursively and upserts each.
 * Designed for Cloud Scheduler.
 */
export async function reindexHandler(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised('reindex')

  const rootFolderId = process.env.ROOT_FOLDER_ID
  if (!rootFolderId) return jsonError('ROOT_FOLDER_ID is not set', 500)

  console.log(`[reindex] Starting full sweep of ${rootFolderId}`)
  const start = Date.now()

  let synced = 0
  let failed = 0
  try {
    const entries = await listAllFiles(rootFolderId)
    console.log(`[reindex] Found ${entries.length} supported files`)

    for (const entry of entries) {
      try {
        await syncOne(entry.id)
        synced++
      } catch (err) {
        failed++
        console.error(`[reindex] Failed ${entry.id} (${entry.name}):`, err)
      }
    }

    const ms = Date.now() - start
    console.log(
      `[reindex] Done synced=${synced} failed=${failed} total=${entries.length} in ${ms}ms`,
    )
    return jsonOk({ ok: true, synced, failed, total: entries.length, ms })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reindex] Fatal:', err)
    return jsonError(message, 500)
  }
}

/**
 * Core single-file sync pipeline shared by /sync/:id and /reindex.
 */
async function syncOne(
  fileId: string,
): Promise<{ title: string; version: number; changed: boolean }> {
  const meta = await getFileMeta(fileId)

  if (!isSupported(meta.mimeType)) {
    throw new Error(`Unsupported mimeType: ${meta.mimeType}`)
  }

  const [markdown, folderPath] = await Promise.all([
    exportFileAsMarkdown(fileId, meta.mimeType),
    resolveFolderPath(fileId),
  ])

  // Image rewrite only applies to Docs — Sheets/Slides/Forms don't emit
  // googleusercontent image URLs via these export paths.
  const cleaned =
    meta.mimeType === MIME.doc ? await rewriteImageUrls(markdown) : markdown

  const result = await upsertDoc({
    id: fileId,
    driveId: fileId,
    title: meta.title,
    folderPath,
    markdown: cleaned,
    mimeType: meta.mimeType,
  })

  return { title: meta.title, ...result }
}

function authorised(req: Request): boolean {
  return req.headers.get('X-Sync-Secret') === process.env.SYNC_SECRET
}

function unauthorised(context: string): Response {
  console.warn(`[sync] Unauthorised request (${context})`)
  return jsonError('Unauthorised', 401)
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
