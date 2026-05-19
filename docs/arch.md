# Kaybee — Sync Architecture

## Pipeline Overview

```
Google Docs (edited by Loopers)
  │
  └─ n8n — Google Drive trigger
       └─ POST /sync/:docId  →  Cloud Run
             ├─ drive.files.export  →  text/markdown
             ├─ strip base64 data: image strings
             ├─ fetch real images via Drive API
             │     └─ SHA-256 hash → upload to GCS → rewrite URL in Markdown
             └─ upsert to Firestore
```

---

## Document Lifecycle (one sync)

| Step | What happens |
|---|---|
| 1 | n8n detects a Drive change, POSTs `{ docId, folderId }` to `/sync/:docId` |
| 2 | Cloud Run calls `drive.files.export(docId, 'text/markdown')` → raw Markdown string |
| 3 | Strip all `data:` base64 strings from the Markdown (storage + token limit guardrail) |
| 4 | For each real image: fetch via Drive API → SHA-256 hash → upload to GCS at `/a/<hash>` → rewrite `src` in Markdown |
| 5 | Upsert document to Firestore: `{ id, title, folderPath, markdown, updatedAt, driveId }` |
| 6 | HTML rendered from stored Markdown at serve time (or cached in the same Firestore doc) |

**Target latency:** Drive edit → visible in Kaybee in under 10 seconds.

---

## Reconciler (Safety Net)

A second n8n workflow runs on a schedule (every 5–15 minutes). It lists all files in the Drive folder via `drive.files.list`, finds any that are missing from Firestore or have a newer `modifiedTime`, and re-triggers the sync pipeline for each. This catches any events the trigger missed — no extra code required, configured entirely in n8n.

---

## Key Files

| File | Responsibility |
|---|---|
| `src/sync/handler.ts` | `/sync/:docId` endpoint — entry point for n8n trigger |
| `src/drive/exporter.ts` | `drive.files.export` call + base64 strip |
| `src/storage/assets.ts` | Image fetch → GCS upload → URL rewrite |
| `src/firestore/docs.ts` | Firestore read/write for documents |
| `src/render/markdown.ts` | Markdown → HTML (`marked`) |
| `src/server/routes.ts` | Page serving + search queries |

---

## Firestore Document Schema

```ts
interface KaybeeDoc {
  id: string;           // Google Drive file ID
  title: string;
  folderPath: string;   // e.g. "ops/runbooks"
  markdown: string;     // cleaned Markdown (no base64)
  updatedAt: Timestamp;
  driveId: string;      // same as id, kept for clarity
}
```

No migrations. Fields can be added freely — Firestore is schema-free.

---

## Security

The `/sync` endpoint checks the `X-Sync-Secret` header against the `SYNC_SECRET` environment variable. Requests without a valid secret return `401` immediately — no Drive API calls are made.

---

## n8n Workflow Notes

- **Trigger:** Google Drive — "Watch Files in Folder" node, scoped to `ROOT_FOLDER_ID`
- **Action:** HTTP Request node → `POST https://<cloud-run-url>/sync/{{ $json.id }}`  with `X-Sync-Secret` header
- **Reconciler:** Separate scheduled workflow — "Drive List Files" → filter stale → loop → HTTP Request
- Polling interval for the trigger is configurable in n8n. Webhook mode (if n8n is publicly reachable) gets latency under 3 seconds.
