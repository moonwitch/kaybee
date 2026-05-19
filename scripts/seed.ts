/**
 * One-shot seed script — drops a welcome doc into Firestore so the
 * home page has something to render before the first real sync.
 *
 *   bun run seed
 *
 * Safe to re-run; it's an upsert keyed on `seed-welcome`.
 * Delete it once you have real content:
 *   gcloud firestore documents delete docs/seed-welcome
 */
import { upsertDoc } from '../src/firestore/docs.ts'
import { MIME } from '../src/drive/exporter.ts'

const SEED_ID = 'seed-welcome'

const markdown = `# Welcome to Kaybee

This is the **Loop Library** — your single home for everything the team writes, decides, and ships. #welcome #getting-started

## What you'll find here

- **Docs** — runbooks, policies, design decisions, anything someone has bothered to write down.
- **Sheets** — the first rows show inline; click through to edit in Google.
- **Slides** — text content from each slide, with a link back to the original deck.
- **Forms** — open in Google Forms to view or fill out.

## How it stays fresh

Kaybee syncs from Google Drive automatically. When someone edits a doc, the change is live here within seconds — no copy-pasting, no stale links. #intranet

## Need something?

Search at the top, browse by **category** on the home page, peek at the **Calendar** to see what's coming up, or click any **#tag** to find related docs.

> _This is a seed entry. It will sit alongside your real content until you delete it._
`

async function main() {
  console.log(`[seed] Writing ${SEED_ID} to Firestore…`)
  await upsertDoc({
    id: SEED_ID,
    driveId: SEED_ID,
    title: 'Welcome to Kaybee',
    folderPath: 'Getting Started',
    markdown,
    mimeType: MIME.doc,
  })
  console.log(`[seed] Done. Visit http://localhost:8080/doc/${SEED_ID}`)
}

main().catch((err) => {
  console.error('[seed] Failed:', err)
  process.exit(1)
})
