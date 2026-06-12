import crypto from 'node:crypto'
import { Firestore, Timestamp } from '@google-cloud/firestore'

const db = new Firestore({
  projectId: process.env.GCP_PROJECT_ID,
  databaseId: process.env.FIRESTORE_DATABASE_ID,
})
const COLLECTION = 'docs'
const VERSIONS = 'versions'

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
  /** Monotonic content version. Docs written before versioning may lack it. */
  version?: number
  /** SHA-256 of title|folderPath|markdown — used to skip no-op syncs. */
  contentHash?: string
}

/** One immutable snapshot in docs/{id}/versions/{n}. */
export interface KaybeeDocVersion {
  version: number
  title: string
  folderPath: string
  markdown: string
  mimeType: string
  contentHash: string
  savedAt: Timestamp
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

export interface UpsertResult {
  /** False when the incoming content is byte-identical to what's stored. */
  changed: boolean
  /** Version now current for this doc (0 only for legacy docs never re-synced). */
  version: number
}

/**
 * Create or fully replace a document.
 * Tokenises the title for search and extracts inline #tags from the body.
 *
 * Version control: every content change (title, folder, or body) bumps
 * `version` and writes an immutable snapshot to docs/{id}/versions/{n}.
 * A sync that carries identical content is a no-op — `updatedAt` keeps
 * meaning "last real edit", and reindex sweeps don't pollute the history.
 */
export async function upsertDoc(
  doc: Omit<
    KaybeeDoc,
    'id' | 'keywords' | 'tags' | 'updatedAt' | 'version' | 'contentHash'
  > & { id: string },
): Promise<UpsertResult> {
  const keywords = tokenise(doc.title)
  const tags = extractTags(doc.markdown)
  const contentHash = hashContent(doc.title, doc.folderPath, doc.markdown)

  const ref = db.collection(COLLECTION).doc(doc.id)
  const snap = await ref.get()
  const prev = snap.exists ? (snap.data() as KaybeeDoc) : undefined
  const prevHash =
    prev?.contentHash ??
    (prev ? hashContent(prev.title, prev.folderPath, prev.markdown) : undefined)

  if (prev && prevHash === contentHash) {
    // Content untouched. Still refresh derived fields if the derivation
    // code changed (that's what POST /reindex backfills) — but don't bump
    // updatedAt and don't write a version.
    if (!sameStrings(prev.keywords, keywords) || !sameStrings(prev.tags, tags)) {
      await ref.update({ keywords, tags, contentHash })
    } else if (!prev.contentHash) {
      await ref.update({ contentHash })
    }
    return { changed: false, version: prev.version ?? 0 }
  }

  const version = (prev?.version ?? 0) + 1
  const savedAt = Timestamp.now()

  const batch = db.batch()
  batch.set(ref, {
    title: doc.title,
    folderPath: doc.folderPath,
    markdown: doc.markdown,
    keywords,
    tags,
    updatedAt: savedAt,
    driveId: doc.driveId,
    mimeType: doc.mimeType,
    version,
    contentHash,
  })
  batch.set(ref.collection(VERSIONS).doc(versionKey(version)), {
    version,
    title: doc.title,
    folderPath: doc.folderPath,
    markdown: doc.markdown,
    mimeType: doc.mimeType,
    contentHash,
    savedAt,
  })
  await batch.commit()

  return { changed: true, version }
}

/** Newest-first version history for a doc. */
export async function listVersions(
  docId: string,
  limit: number = 50,
): Promise<KaybeeDocVersion[]> {
  const snap = await db
    .collection(COLLECTION)
    .doc(docId)
    .collection(VERSIONS)
    .orderBy('version', 'desc')
    .limit(limit)
    .get()

  return snap.docs.map((d) => d.data() as KaybeeDocVersion)
}

export async function getVersion(
  docId: string,
  version: number,
): Promise<KaybeeDocVersion | null> {
  if (!Number.isInteger(version) || version < 1) return null
  const snap = await db
    .collection(COLLECTION)
    .doc(docId)
    .collection(VERSIONS)
    .doc(versionKey(version))
    .get()

  if (!snap.exists) return null
  return snap.data() as KaybeeDocVersion
}

/** Zero-padded so Firestore doc-id ordering matches numeric ordering. */
function versionKey(version: number): string {
  return String(version).padStart(6, '0')
}

function hashContent(
  title: string,
  folderPath: string,
  markdown: string,
): string {
  return crypto
    .createHash('sha256')
    .update([title, folderPath, markdown].join('\u0000'))
    .digest('hex')
}

function sameStrings(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
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
