import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/forms.body.readonly',
  ],
})

const drive = google.drive({ version: 'v3', auth })

export const MIME = {
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slide: 'application/vnd.google-apps.presentation',
  form: 'application/vnd.google-apps.form',
  folder: 'application/vnd.google-apps.folder',
} as const

export type SupportedMime =
  | typeof MIME.doc
  | typeof MIME.sheet
  | typeof MIME.slide
  | typeof MIME.form

export function isSupported(mimeType: string): mimeType is SupportedMime {
  return (
    mimeType === MIME.doc ||
    mimeType === MIME.sheet ||
    mimeType === MIME.slide ||
    mimeType === MIME.form
  )
}

/**
 * Dispatcher: turns any supported Google Workspace file into Markdown.
 * Each branch is intentionally small — failure to render one type
 * never blocks the indexer.
 */
export async function exportFileAsMarkdown(
  fileId: string,
  mimeType: string,
): Promise<string> {
  switch (mimeType) {
    case MIME.doc:
      return exportDocAsMarkdown(fileId)
    case MIME.sheet:
      return exportSheetAsMarkdown(fileId)
    case MIME.slide:
      return exportSlidesAsMarkdown(fileId)
    case MIME.form:
      return exportFormAsMarkdown(fileId)
    default:
      return ''
  }
}

async function exportDocAsMarkdown(fileId: string): Promise<string> {
  const response = await drive.files.export(
    { fileId, mimeType: 'text/markdown' },
    { responseType: 'text' },
  )
  return stripBase64Images(response.data as string)
}

/**
 * Sheets — export as CSV, render first N rows as a Markdown table.
 * Keeps the payload small and the wiki view readable.
 */
async function exportSheetAsMarkdown(fileId: string): Promise<string> {
  const PREVIEW_ROWS = 25
  const response = await drive.files.export(
    { fileId, mimeType: 'text/csv' },
    { responseType: 'text' },
  )
  const csv = response.data as string
  return csvPreviewToMarkdown(csv, PREVIEW_ROWS, fileId)
}

/**
 * Slides — Drive export to text/plain gives slide text; export to PDF would
 * need binary handling. Plain text is the simplest readable form for MVP.
 */
async function exportSlidesAsMarkdown(fileId: string): Promise<string> {
  const response = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' },
  )
  const text = (response.data as string) ?? ''
  const slides = text.split(/\f|\n\n\n+/).map((s) => s.trim()).filter(Boolean)
  const body = slides
    .map((s, i) => `### Slide ${i + 1}\n\n${s}`)
    .join('\n\n---\n\n')
  return body || '_Empty presentation._'
}

/**
 * Forms — show a card-style stub. No question rendering for MVP.
 */
async function exportFormAsMarkdown(fileId: string): Promise<string> {
  const url = `https://docs.google.com/forms/d/${fileId}/viewform`
  return [
    '> **Google Form**',
    '',
    `[Open form ↗](${url})`,
    '',
    'Forms are not previewed inline. Click through to view or fill it out.',
  ].join('\n')
}

export async function getFileMeta(fileId: string): Promise<{
  title: string
  parents: string[]
  mimeType: string
}> {
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,parents,mimeType',
    supportsAllDrives: true,
  })

  return {
    title: response.data.name ?? 'Untitled',
    parents: response.data.parents ?? [],
    mimeType: response.data.mimeType ?? '',
  }
}

/**
 * Walks up the parent chain. Returns "Operations/Runbooks" style path.
 * Bounded depth so a cycle (shouldn't happen, but) can't loop forever.
 */
export async function resolveFolderPath(fileId: string): Promise<string> {
  const segments: string[] = []
  let currentId = fileId

  for (let depth = 0; depth < 8; depth++) {
    const response = await drive.files.get({
      fileId: currentId,
      fields: 'id,name,parents',
      supportsAllDrives: true,
    })

    const name = response.data.name ?? ''
    const parents = response.data.parents ?? []

    if (depth > 0) segments.unshift(name)
    if (!parents.length) break
    currentId = parents[0]!
  }

  return segments.join('/') || 'Uncategorised'
}

export function stripBase64Images(markdown: string): string {
  return markdown.replace(
    /!\[[^\]]*\]\(data:[^;]+;base64,[^)]+\)/g,
    '',
  )
}

/**
 * Minimal CSV → first-N-rows Markdown table.
 * Does not handle multi-line quoted cells — fine for a wiki preview.
 */
export function csvPreviewToMarkdown(
  csv: string,
  rowLimit: number,
  fileId: string,
): string {
  const rows = csv
    .split(/\r?\n/)
    .filter((r) => r.length > 0)
    .slice(0, rowLimit)
    .map(parseCsvRow)

  if (rows.length === 0) return '_Empty sheet._'

  const header = rows[0]!
  const body = rows.slice(1)

  const md: string[] = []
  md.push(`| ${header.map(escCell).join(' | ')} |`)
  md.push(`| ${header.map(() => '---').join(' | ')} |`)
  for (const r of body) {
    const cells = header.map((_, i) => escCell(r[i] ?? ''))
    md.push(`| ${cells.join(' | ')} |`)
  }

  md.push('')
  md.push(
    `_Showing first ${body.length} row${body.length === 1 ? '' : 's'}._ ` +
      `[Open in Sheets ↗](https://docs.google.com/spreadsheets/d/${fileId}/edit)`,
  )
  return md.join('\n')
}

function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function escCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}
