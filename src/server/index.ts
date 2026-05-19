import { router } from './routes.ts'

const PORT = parseInt(process.env.PORT ?? '8080')

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    try {
      return await router(req)
    } catch (err) {
      console.error('[server] Unhandled error:', err)
      return new Response('Internal server error', { status: 500 })
    }
  },
})

console.log(`🟡 Kaybee running at http://localhost:${server.port}`)
