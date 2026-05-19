import path from 'node:path'
import { getDoc, listDocs, searchDocs, listCategories } from '../firestore/docs.ts'
import { syncHandler } from '../sync/handler.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { serveAsset } from '../storage/assets.ts'
import { renderHome } from './templates/home.ts'
import { renderDoc } from './templates/doc.ts'

/**
 * Main request router.
 * All routes return a Response — no framework, just Bun.serve().
 */
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const { pathname } = url

  // Static files (/public/*)
  if (pathname.startsWith('/public/')) {
    return serveStatic(pathname)
  }

  // GCS-backed asset proxy (/a/<sha256>.<ext>)
  if (pathname.startsWith('/a/')) {
    return serveAsset(pathname.slice(3))
  }

  // Sync endpoint — called by n8n
  if (req.method === 'POST' && pathname.startsWith('/sync/')) {
    const docId = pathname.replace('/sync/', '').split('/')[0]
    if (!docId) return jsonError('Missing docId', 400)
    return syncHandler(req, docId)
  }

  // Search
  if (pathname === '/search') {
    const q = url.searchParams.get('q')?.trim() ?? ''
    if (!q) return Response.redirect('/', 302)
    const results = await searchDocs(q)
    return htmlResponse(renderHome([], [], results, q))
  }

  // Document reader /doc/:id
  const docMatch = pathname.match(/^\/doc\/([^/]+)$/)
  if (docMatch) {
    const docId = docMatch[1]!
    const doc = await getDoc(docId)
    if (!doc) return new Response('Document not found', { status: 404 })
    const html = await renderMarkdown(doc.markdown)
    return htmlResponse(renderDoc(doc, html))
  }

  // Home
  if (pathname === '/') {
    const [recent, categories] = await Promise.all([
      listDocs(12),
      listCategories(),
    ])
    return htmlResponse(renderHome(recent, categories, [], ''))
  }

  return new Response('Not found', { status: 404 })
}

async function serveStatic(pathname: string): Promise<Response> {
  // Prevent path traversal
  const safe = pathname.replace(/\.\./g, '').replace(/\/+/g, '/')
  const filePath = path.join(process.cwd(), safe)
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(file)
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
