import { google, type drive_v3 } from 'googleapis'
import type { GaxiosResponse } from 'gaxios'
import { MIME, isSupported, type SupportedMime } from './exporter.ts'

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

const drive = google.drive({ version: 'v3', auth })

const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

export interface DriveEntry {
  id: string
  name: string
  mimeType: SupportedMime
  parents: string[]
}

/**
 * Lists every supported Workspace file under `rootFolderId`.
 *
 * Two strategies:
 *  - Shared Drive: one paginated listing of the whole drive (corpora=drive).
 *    The drive's folder layout doesn't matter — every file shows up regardless
 *    of nesting. Folder paths are derived later from `parents`.
 *  - Regular folder: BFS walk via `'X' in parents`.
 *
 * Shortcuts are dereferenced: a shortcut to a supported file becomes an
 * entry pointing at the target.
 */
export async function listAllFiles(
  rootFolderId: string,
): Promise<DriveEntry[]> {
  const driveId = await detectSharedDriveId(rootFolderId)
  console.log(
    `[indexer] root=${rootFolderId} ` +
      `mode=${driveId ? `shared-drive(${driveId})` : 'folder'}`,
  )

  return driveId
    ? listEntireSharedDrive(driveId)
    : walkFolderTree(rootFolderId)
}

async function listEntireSharedDrive(driveId: string): Promise<DriveEntry[]> {
  const results: DriveEntry[] = []
  const mimeCounts: Record<string, number> = {}
  let total = 0
  let pageToken: string | undefined = undefined

  while (true) {
    const response: GaxiosResponse<drive_v3.Schema$FileList> =
      await drive.files.list({
        q: 'trashed = false',
        fields:
          'nextPageToken, files(id, name, mimeType, parents, shortcutDetails)',
        pageSize: 1000,
        pageToken,
        corpora: 'drive',
        driveId,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

    const files = response.data.files ?? []
    total += files.length
    for (const f of files) {
      const m = f.mimeType ?? '(none)'
      mimeCounts[m] = (mimeCounts[m] ?? 0) + 1
    }
    for (const file of files) collect(file, results)

    pageToken = response.data.nextPageToken ?? undefined
    if (!pageToken) break
  }

  console.log(
    `[indexer] drive scan total=${total} mimes=${JSON.stringify(mimeCounts)}`,
  )
  return results
}

async function walkFolderTree(rootFolderId: string): Promise<DriveEntry[]> {
  const results: DriveEntry[] = []
  const queue: string[] = [rootFolderId]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const folderId = queue.shift()!
    if (seen.has(folderId)) continue
    seen.add(folderId)

    let pageToken: string | undefined = undefined
    while (true) {
      const response: GaxiosResponse<drive_v3.Schema$FileList> =
        await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields:
            'nextPageToken, files(id, name, mimeType, parents, shortcutDetails)',
          pageSize: 1000,
          pageToken,
          corpora: 'allDrives',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

      const files = response.data.files ?? []
      console.log(`[indexer] folder=${folderId} pageItems=${files.length}`)
      for (const file of files) {
        if (file.mimeType === MIME.folder && file.id) {
          queue.push(file.id)
        } else {
          collect(file, results)
        }
      }

      pageToken = response.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
  }

  return results
}

/**
 * Adds a file to results if it's a supported type (or a shortcut to one).
 * Mutates `results` in place — keeps the call sites lean.
 */
function collect(file: drive_v3.Schema$File, results: DriveEntry[]): void {
  if (!file.id || !file.mimeType) return

  if (file.mimeType === SHORTCUT_MIME) {
    const targetId = file.shortcutDetails?.targetId
    const targetMime = file.shortcutDetails?.targetMimeType
    if (!targetId || !targetMime || !isSupported(targetMime)) return
    results.push({
      id: targetId,
      name: file.name ?? 'Untitled',
      mimeType: targetMime,
      parents: file.parents ?? [],
    })
    return
  }

  if (!isSupported(file.mimeType)) return
  results.push({
    id: file.id,
    name: file.name ?? 'Untitled',
    mimeType: file.mimeType,
    parents: file.parents ?? [],
  })
}

/**
 * Returns the Shared Drive ID if `id` is a Shared Drive root, otherwise undefined.
 * Cheap probe — drives.get returns 404 for regular folders.
 */
async function detectSharedDriveId(id: string): Promise<string | undefined> {
  try {
    const resp = await drive.drives.get({ driveId: id })
    return resp.data.id ?? undefined
  } catch {
    return undefined
  }
}
