import { google, type drive_v3 } from 'googleapis'
import type { GaxiosResponse } from 'gaxios'
import { MIME, isSupported, type SupportedMime } from './exporter.ts'

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

const drive = google.drive({ version: 'v3', auth })

export interface DriveEntry {
  id: string
  name: string
  mimeType: SupportedMime
  parents: string[]
}

/**
 * Recursively lists every supported Workspace file under `rootFolderId`.
 *
 * Handles both regular folders and Shared Drives. For a Shared Drive root,
 * `driveId` + `corpora: 'drive'` are required — otherwise `'X' in parents`
 * silently returns zero items, which is the #1 Shared Drive API gotcha.
 */
export async function listAllFiles(
  rootFolderId: string,
): Promise<DriveEntry[]> {
  const driveId = await detectSharedDriveId(rootFolderId)
  console.log(
    `[indexer] root=${rootFolderId} ` +
      `mode=${driveId ? `shared-drive(${driveId})` : 'folder'}`,
  )

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
          fields: 'nextPageToken, files(id, name, mimeType, parents)',
          pageSize: 1000,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          ...(driveId
            ? { corpora: 'drive', driveId }
            : { corpora: 'allDrives' }),
        })

      const files = response.data.files ?? []
      console.log(
        `[indexer] folder=${folderId} pageItems=${files.length}`,
      )

      for (const file of files) {
        if (!file.id || !file.mimeType) continue
        if (file.mimeType === MIME.folder) {
          queue.push(file.id)
          continue
        }
        if (!isSupported(file.mimeType)) continue
        results.push({
          id: file.id,
          name: file.name ?? 'Untitled',
          mimeType: file.mimeType,
          parents: file.parents ?? [],
        })
      }

      pageToken = response.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
  }

  return results
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
