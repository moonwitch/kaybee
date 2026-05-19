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
 * Folders are traversed; binaries and unsupported types are skipped.
 *
 * Uses corpora=allDrives so the call works for both shared drives and
 * regular folders shared with the service account.
 */
export async function listAllFiles(
  rootFolderId: string,
): Promise<DriveEntry[]> {
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
          corpora: 'allDrives',
        })

      for (const file of response.data.files ?? []) {
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
