import crypto from 'node:crypto'
import {
  exportFileAsMarkdown,
  getFileMeta,
  resolveFolderPath,
  isSupported,
  MIME,
} from '../drive/exporter.ts'
import { listAllFiles } from '../drive/indexer.ts'
import { upsertDoc, listSyncState, deleteDoc } from '../firestore/docs.ts'
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
 * POST /reindex — reconciling sweep of ROOT_FOLDER_ID.
 * Designed for Cloud Scheduler on a tight interval: files whose Drive
 * modifiedTime hasn't moved since their last sync are skipped (one cheap
 * files.list instead of N exports), and docs that no longer exist in the
 * Drive are deleted from Firestore along with their version history.
 *
 * `POST /reindex?force=1` bypasses the modifiedTime skip — use after a
 * code change to the export/asset pipeline to re-process every file.
 * (The content-hash check still prevents pointless versions.)
 */
export async function reindexHandler(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised('reindex')

  const rootFolderId = process.env.ROOT_FOLDER_ID
  if (!rootFolderId) return jsonError('ROOT_FOLDER_ID is not set', 500)

  const force = new URL(req.url).searchParams.has('force')
  console.log(`[reindex] Starting sweep of ${rootFolderId}${force ? ' (force)' : ''}`)
  const start = Date.now()

  let synced = 0
  let skipped = 0
  let deleted = 0
  let failed = 0
  try {
    const [entries, state] = await Promise.all([
      listAllFiles(rootFolderId),
      listSyncState(),
    ])
    console.log(
      `[reindex] Found ${entries.length} supported files, ${state.size} indexed docs`,
    )

    const liveIds = new Set<string>()
    for (const entry of entries) {
      liveIds.add(entry.id)
      // Skip when Drive says the file hasn't changed since we last synced it.
      // Shortcut targets carry no modifiedTime and always re-sync.
      if (!force && entry.modifiedTime && state.get(entry.id) === entry.modifiedTime) {
        skipped++
        continue
      }
      try {
        await syncOne(entry.id)
        synced++
      } catch (err) {
        failed++
        console.error(`[reindex] Failed ${entry.id} (${entry.name}):`, err)
      }
    }

    // Anything indexed but no longer in the Drive (deleted, trashed, or
    // moved out) leaves the wiki — including the `bun run seed` doc.
    for (const id of state.keys()) {
      if (liveIds.has(id)) continue
      try {
        await deleteDoc(id)
        deleted++
        console.log(`[reindex] Deleted stray doc ${id}`)
      } catch (err) {
        failed++
        console.error(`[reindex] Failed to delete ${id}:`, err)
      }
    }

    const ms = Date.now() - start
    console.log(
      `[reindex] Done synced=${synced} skipped=${skipped} deleted=${deleted} ` +
        `failed=${failed} total=${entries.length} in ${ms}ms`,
    )
    return jsonOk({
      ok: true,
      synced,
      skipped,
      deleted,
      failed,
      total: entries.length,
      ms,
    })
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
    driveModifiedTime: meta.modifiedTime,
  })

  return { title: meta.title, ...result }
}

function authorised(req: Request): boolean {
  const expected = process.env.SYNC_SECRET
  const given = req.headers.get('X-Sync-Secret')
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
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
