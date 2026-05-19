import { Firestore, Timestamp } from '@google-cloud/firestore'

const db = new Firestore({
  projectId: process.env.GCP_PROJECT_ID,
  databaseId: process.env.FIRESTORE_DATABASE_ID,
})
const COLLECTION = 'docs'

export interface KaybeeDoc {
  id: string
  title: string
  folderPath: string
  markdown: string
  keywords: string[]
  tags: string[]
  updatedAt: Timestamp
  driveId: string
  mimeType: string
}

export interface CategoryNode {
  /** Last segment, e.g. "Runbooks" */
  name: string
  /** Full path, e.g. "Operations/Runbooks" */
  path: string
  /** Docs anywhere under this path (recursive count) */
  docCount: number
}

export async function getDoc(id: string): Promise<KaybeeDoc | null> {
  const snap = await db.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...snap.data() } as KaybeeDoc
}

export async function listDocs(limit: number = 12): Promise<KaybeeDoc[]> {
  const snap = await db
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as KaybeeDoc)
}

/**
 * Keyword search using the pre-tokenised keywords array.
 * MVP — searches by the first word only.
 */
export async function searchDocs(query: string): Promise<KaybeeDoc[]> {
  const term = query.trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (!term) return []

  const snap = await db
    .collection(COLLECTION)
    .where('keywords', 'array-contains', term)
    .orderBy('updatedAt', 'desc')
    .limit(20)
    .get()

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as KaybeeDoc)
}

/**
 * Browse a folder. Returns the direct subfolders (with recursive doc counts)
 * and the docs that live directly in this folder.
 *
 * `parentPath = ''` returns the top-level view.
 */
export async function browseCategory(parentPath: string): Promise<{
  subfolders: CategoryNode[]
  docs: KaybeeDoc[]
}> {
  const snap = await db
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .get()

  const docs: KaybeeDoc[] = []
  const subCounts = new Map<string, number>()

  const prefix = parentPath ? parentPath + '/' : ''

  for (const d of snap.docs) {
    const data = { id: d.id, ...d.data() } as KaybeeDoc
    const fp = data.folderPath || 'Uncategorised'

    if (fp === parentPath) {
      docs.push(data)
      continue
    }
    if (!parentPath || fp.startsWith(prefix)) {
      const remainder = parentPath ? fp.slice(prefix.length) : fp
      const next = remainder.split('/')[0]
      if (!next) continue
      const childPath = prefix + next
      subCounts.set(childPath, (subCounts.get(childPath) ?? 0) + 1)
    }
  }

  const subfolders: CategoryNode[] = [...subCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path, docCount]) => ({
      name: path.split('/').at(-1) ?? path,
      path,
      docCount,
    }))

  return { subfolders, docs }
}

export async function listDocsByTag(tag: string): Promise<KaybeeDoc[]> {
  const clean = tag.toLowerCase().trim()
  if (!clean) return []

  // No orderBy here — the (array-contains + orderBy) combo would require a
  // composite index. The page caps at 50; sorting in-memory is free.
  const snap = await db
    .collection(COLLECTION)
    .where('tags', 'array-contains', clean)
    .limit(50)
    .get()

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as KaybeeDoc)
    .sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? 0
      const tb = b.updatedAt?.toMillis?.() ?? 0
      return tb - ta
    })
}

/**
 * Create or fully replace a document.
 * Tokenises the title for search and extracts inline #tags from the body.
 */
export async function upsertDoc(
  doc: Omit<KaybeeDoc, 'id' | 'keywords' | 'tags' | 'updatedAt'> & { id: string },
): Promise<void> {
  const keywords = tokenise(doc.title)
  const tags = extractTags(doc.markdown)

  await db
    .collection(COLLECTION)
    .doc(doc.id)
    .set({
      title: doc.title,
      folderPath: doc.folderPath,
      markdown: doc.markdown,
      keywords,
      tags,
      updatedAt: Timestamp.now(),
      driveId: doc.driveId,
      mimeType: doc.mimeType,
    })
}

function tokenise(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) ?? [])]
}

/**
 * Extract `#tag` markers from Markdown.
 * Skips headings (`# H1`, `## H2`) — those have a space after the `#`.
 * Tag = `#` preceded by whitespace/start, followed immediately by a letter,
 * 2–31 chars of [a-z0-9-].
 */
export function extractTags(markdown: string): string[] {
  const matches = markdown.matchAll(/(?<!\S)#([a-z][a-z0-9-]{1,30})\b/gi)
  return [...new Set([...matches].map((m) => m[1]!.toLowerCase()))]
}
