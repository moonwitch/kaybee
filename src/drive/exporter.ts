import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

const drive = google.drive({ version: 'v3', auth })

/**
 * Exports a Google Doc as Markdown via drive.files.export.
 * Strips base64 data: image blobs to protect storage and token limits.
 * Returns the cleaned Markdown string.
 */
export async function exportDocAsMarkdown(docId: string): Promise<string> {
  const response = await drive.files.export(
    { fileId: docId, mimeType: 'text/markdown' },
    { responseType: 'text' },
  )

  const raw = response.data as string
  return stripBase64Images(raw)
}

/**
 * Fetches metadata (title, parents) for a Drive file.
 */
export async function getFileMeta(
  fileId: string,
): Promise<{ title: string; parents: string[] }> {
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,parents',
  })

  return {
    title: response.data.name ?? 'Untitled',
    parents: response.data.parents ?? [],
  }
}

/**
 * Resolves a file's folder path by walking up the parent chain.
 * Returns a string like "Operations/Runbooks".
 */
export async function resolveFolderPath(fileId: string): Promise<string> {
  const segments: string[] = []
  let currentId = fileId

  for (let depth = 0; depth < 8; depth++) {
    const response = await drive.files.get({
      fileId: currentId,
      fields: 'id,name,parents',
    })

    const name = response.data.name ?? ''
    const parents = response.data.parents ?? []

    if (depth > 0) segments.unshift(name)
    if (!parents.length) break
    currentId = parents[0]!
  }

  return segments.join('/') || 'Uncategorised'
}

/**
 * Removes base64-encoded data: image strings from Markdown.
 * These are produced by some Drive export variants and must never be stored.
 *
 * Matches: ![alt](data:image/...;base64,...)
 */
export function stripBase64Images(markdown: string): string {
  return markdown.replace(
    /!\[[^\]]*\]\(data:[^;]+;base64,[^)]+\)/g,
    '',
  )
}
