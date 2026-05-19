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
  updatedAt: Timestamp
  driveId: string
}

export interface Category {
  name: string
  path: string
  docCount: number
}

/**
 * Fetch a single document by its Drive file ID.
 */
export async function getDoc(id: string): Promise<KaybeeDoc | null> {
  const snap = await db.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...snap.data() } as KaybeeDoc
}

/**
 * List the most recently updated documents.
 */
export async function listDocs(limit: number = 12): Promise<KaybeeDoc[]> {
  const snap = await db
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as KaybeeDoc)
}

/**
 * Basic keyword search using pre-tokenised keywords array.
 * Searches for the first word of the query — good enough for MVP.
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
 * Compute categories from all docs' folderPaths.
 * Firestore has no GROUP BY — we aggregate in memory.
 */
export async function listCategories(): Promise<Category[]> {
  const snap = await db
    .collection(COLLECTION)
    .select('folderPath')
    .get()

  const counts = new Map<string, number>()
  for (const doc of snap.docs) {
    const path = (doc.data().folderPath as string) || 'Uncategorised'
    counts.set(path, (counts.get(path) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path, docCount]) => ({
      name: path.split('/').at(-1) ?? path,
      path,
      docCount,
    }))
}

/**
 * Create or fully replace a document.
 * Tokenises the title into keywords for search.
 */
export async function upsertDoc(
  doc: Omit<KaybeeDoc, 'id' | 'keywords' | 'updatedAt'> & { id: string },
): Promise<void> {
  const keywords = tokenise(doc.title)

  await db
    .collection(COLLECTION)
    .doc(doc.id)
    .set({
      title: doc.title,
      folderPath: doc.folderPath,
      markdown: doc.markdown,
      keywords,
      updatedAt: Timestamp.now(),
      driveId: doc.driveId,
    })
}

function tokenise(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) ?? [])]
}
