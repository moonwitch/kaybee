import path from 'node:path'
import {
  getDoc,
  listDocs,
  searchDocs,
  browseCategory,
  listDocsByTag,
} from '../firestore/docs.ts'
import { syncHandler, reindexHandler } from '../sync/handler.ts'
import { renderMarkdown } from '../render/markdown.ts'
import { serveAsset } from '../storage/assets.ts'
import { listUpcomingEvents, type CalendarEvent } from '../calendar/client.ts'
import { renderHome } from './views/home.ts'
import { renderDoc } from './views/doc.ts'
import { renderCalendar } from './views/calendar.ts'
import { renderCategory } from './views/category.ts'
import { renderTag } from './views/tag.ts'
import { renderError } from './views/error.ts'

/**
 * Main request router.
 * All routes return a Response — no framework, just Bun.serve().
 */
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const { pathname } = url

  if (pathname === '/healthz') return new Response('ok')

  if (pathname.startsWith('/assets/')) {
    return serveAssetFile(pathname.slice('/assets/'.length))
  }

  if (pathname.startsWith('/a/')) {
    return serveAsset(pathname.slice(3))
  }

  if (req.method === 'POST' && pathname === '/reindex') {
    return reindexHandler(req)
  }

  if (req.method === 'POST' && pathname.startsWith('/sync/')) {
    const fileId = pathname.replace('/sync/', '').split('/')[0]
    if (!fileId) return jsonError('Missing fileId', 400)
    return syncHandler(req, fileId)
  }

  if (pathname === '/search') {
    const q = url.searchParams.get('q')?.trim() ?? ''
    if (!q) return Response.redirect('/', 302)
    const results = await searchDocs(q)
    return htmlResponse(renderHome([], [], results, q))
  }

  if (pathname === '/calendar') {
    if (url.searchParams.has('demo')) {
      return htmlResponse(renderCalendar(demoEvents()))
    }
    const ids = (process.env.CALENDAR_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const events = ids.length ? await listUpcomingEvents(ids) : []
    return htmlResponse(renderCalendar(events))
  }

  // /cat/                       → top-level browser
  // /cat/Operations             → folder browser
  // /cat/Operations/Runbooks    → nested
  if (pathname === '/cat' || pathname === '/cat/' || pathname.startsWith('/cat/')) {
    const raw = pathname.replace(/^\/cat\/?/, '')
    const parentPath = decodeURIComponent(raw).replace(/\/+$/, '')
    const { subfolders, docs } = await browseCategory(parentPath)
    return htmlResponse(renderCategory(parentPath, subfolders, docs))
  }

  const tagMatch = pathname.match(/^\/tag\/([^/]+)$/)
  if (tagMatch) {
    const tag = decodeURIComponent(tagMatch[1]!).toLowerCase()
    const docs = await listDocsByTag(tag)
    return htmlResponse(renderTag(tag, docs))
  }

  const docMatch = pathname.match(/^\/doc\/([^/]+)$/)
  if (docMatch) {
    const docId = docMatch[1]!
    const doc = await getDoc(docId)
    if (!doc) return notFound("That document isn't here — it may have been deleted or moved.")
    const html = await renderMarkdown(doc.markdown)
    return htmlResponse(renderDoc(doc, html))
  }

  if (pathname === '/') {
    const [recent, root] = await Promise.all([
      listDocs(12),
      browseCategory(''),
    ])
    return htmlResponse(renderHome(recent, root.subfolders, [], ''))
  }

  return notFound("There's nothing here. Try the home page or use search.")
}

function notFound(message: string): Response {
  return new Response(
    renderError({ code: 404, title: 'Page not found', message }),
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

const ASSETS_DIR = path.join(import.meta.dir, 'assets')

async function serveAssetFile(name: string): Promise<Response> {
  // Reject anything that tries to escape the assets directory.
  if (name.includes('..') || name.includes('/') || name.length === 0) {
    return new Response('Bad request', { status: 400 })
  }
  const file = Bun.file(path.join(ASSETS_DIR, name))
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

function demoEvents(): CalendarEvent[] {
  const now = new Date()
  const at = (daysAhead: number, hour: number, minute: number = 0): Date => {
    const d = new Date(now)
    d.setDate(d.getDate() + daysAhead)
    d.setHours(hour, minute, 0, 0)
    return d
  }
  const hourLater = (d: Date, hours: number = 1): Date =>
    new Date(d.getTime() + hours * 60 * 60 * 1000)

  const samples: Array<Omit<CalendarEvent, 'end'> & { duration: number }> = [
    {
      id: 'demo-1', calendarId: 'demo',
      title: 'All-hands · Quarterly update',
      start: at(0, 16),
      duration: 1,
      location: 'HQ — Atrium',
      htmlLink: 'https://calendar.google.com/calendar/',
    },
    {
      id: 'demo-2', calendarId: 'demo',
      title: 'Library office hours',
      start: at(1, 10, 30),
      duration: 1,
      location: '',
      htmlLink: 'https://calendar.google.com/calendar/',
    },
    {
      id: 'demo-3', calendarId: 'demo',
      title: 'Design review — intranet hero',
      start: at(2, 14),
      duration: 1,
      location: 'Meet — link in invite',
      htmlLink: 'https://calendar.google.com/calendar/',
    },
    {
      id: 'demo-4', calendarId: 'demo',
      title: 'Lunch & learn: Drive search tips',
      start: at(4, 12, 30),
      duration: 1,
      location: 'Kitchen',
      htmlLink: 'https://calendar.google.com/calendar/',
    },
    {
      id: 'demo-5', calendarId: 'demo',
      title: 'Engineering planning',
      start: at(7, 9),
      duration: 2,
      location: 'Room: Helix',
      htmlLink: 'https://calendar.google.com/calendar/',
    },
    {
      id: 'demo-6', calendarId: 'demo',
      title: 'Loop social',
      start: at(10, 17),
      duration: 2,
      location: 'Rooftop',
      htmlLink: 'https://calendar.google.com/calendar/',
    },
  ]

  return samples.map(({ duration, ...e }) => ({ ...e, end: hourLater(e.start, duration) }))
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
