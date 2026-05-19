import { router } from './routes.ts'
import { renderError } from './views/error.ts'

const PORT = parseInt(process.env.PORT ?? '8080')

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    try {
      return await router(req)
    } catch (err) {
      console.error('[server] Unhandled error:', err)
      return serverError()
    }
  },
})

function serverError(): Response {
  try {
    const body = renderError({
      code: 500,
      title: 'Something went wrong',
      message: 'The page failed to load. Try again in a moment.',
    })
    return new Response(body, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    // Last-ditch fallback if rendering itself fails.
    return new Response('Internal server error', { status: 500 })
  }
}

console.log(`🟡 Kaybee running at http://localhost:${server.port}`)
