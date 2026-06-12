# Kaybee — Sync Architecture

## Pipeline Overview

```
Google Docs (edited by Loopers)
  │
  └─ n8n — Google Drive trigger
       └─ POST /sync/:fileId  →  Cloud Run
             ├─ drive.files.export  →  text/markdown
             ├─ re-host every image on GCS (SHA-256 → /a/<hash>.<ext>):
             │     ├─ inline base64 data: URIs → decoded + uploaded
             │     ├─ remote ![md](…) and <img src="…"> → fetched via
             │     │   Drive bearer token + uploaded
             │     └─ leftovers (oversized/undecodable) stripped
             ├─ resolve folder path (skips the Shared Drive root —
             │   the drive itself is never a category)
             └─ upsert to Firestore (also tokenises title → keywords
                  and extracts inline #tags from the body)
```

---

## Document Lifecycle (one sync)

| Step | What happens |
|---|---|
| 1 | n8n detects a Drive change, POSTs to `/sync/:fileId` |
| 2 | Cloud Run calls `drive.files.export(fileId, 'text/markdown')` (or the equivalent for Slides/Sheets/Forms) → raw Markdown string |
| 3 | Re-host inline images: every base64 `data:image/…` URI (how the export embeds most pasted images) is decoded → SHA-256 hash → uploaded to GCS at `/a/<hash>.<ext>` → URL rewritten in the Markdown |
| 4 | Re-host remote images: URLs in both `![md](…)` and `<img src="…">` form are fetched with a Drive bearer token (googleusercontent links 401 anonymously) and uploaded the same way. Any image still carrying a `data:` URI afterwards (oversized > 15 MB, undecodable) is stripped — base64 never reaches Firestore |
| 5 | Resolve `folderPath` by walking parents; the Shared Drive root (no parents) is dropped so it never appears as a category |
| 6 | Tokenise title → `keywords[]` and extract inline `#tags` from the body |
| 7 | Upsert document to Firestore (see schema below). If the content hash is unchanged the write is skipped entirely — `updatedAt` always means "last real edit", and reindex sweeps stay silent |
| 8 | On every real change, bump `version` and write an immutable snapshot to `docs/{id}/versions/{n}` — this powers `/doc/:id/history`, `/doc/:id/v/:n`, and the `/doc/:id/diff/:n` line-diff view |
| 9 | HTML rendered from stored Markdown at serve time |

**Target latency:** Drive edit → visible in Kaybee in under 10 seconds.

---

## Reconciler (built into /reindex)

`POST /reindex` is a reconciling sweep, designed to run every few minutes from Cloud Scheduler (the `bun run provision` script creates the job):

1. One `drive.files.list` of the whole drive + one cheap Firestore projection (`select('driveModifiedTime')` — no markdown bodies cross the wire).
2. Files whose Drive `modifiedTime` matches what we recorded at last sync are **skipped** — no export, no Firestore write.
3. Stale or new files go through the normal sync pipeline.
4. Docs in Firestore that are no longer in the Drive (deleted, trashed, or moved out) are **deleted**, version history included. The `bun run seed` doc disappears this way too once real content exists.

Exception: shortcut targets carry no usable `modifiedTime` (the shortcut's own mtime says nothing about the target), so they re-sync every sweep — the content-hash check in `upsertDoc` still keeps those writes no-ops.

n8n (Drive trigger → `POST /sync/:fileId`) remains an optional add-on for sub-10-second latency; the scheduler sweep alone keeps the site correct.

---

## Key Files

| File | Responsibility |
|---|---|
| `src/sync/handler.ts` | `/sync/:fileId` + `/reindex` endpoints — entry points for n8n / Cloud Scheduler |
| `src/drive/indexer.ts` | Recursive Drive listing (Shared Drive scan or folder BFS); shortcut dereferencing |
| `src/drive/exporter.ts` | `drive.files.export` call + base64 strip; folder-path resolution |
| `src/storage/assets.ts` | Image fetch → GCS upload → URL rewrite |
| `src/firestore/docs.ts` | Firestore read/write for documents + version snapshots |
| `src/render/markdown.ts` | Markdown → HTML (`marked`) |
| `src/server/routes.ts` | Page serving + search queries |
| `src/server/lib/diff.ts` | Line diff (LCS) for the version-changes view |
| `scripts/setup.ts` | `bun run setup` — picks a Shared Drive, writes `.env` |
| `scripts/provision.ts` | `bun run provision` — builds the GCP project (APIs, Firestore, bucket, SA, Cloud Run, Scheduler, optional IAP) |

---

## Firestore Document Schema

```ts
interface KaybeeDoc {
  id: string;           // Google Drive file ID
  driveId: string;      // same as id, kept for clarity
  title: string;
  folderPath: string;   // e.g. "Operations/Runbooks" — never includes the drive root
  markdown: string;     // cleaned Markdown (no base64)
  keywords: string[];   // tokenised from title; powers /search
  tags: string[];       // inline #tags extracted from the body; powers /tag/:tag
  mimeType: string;     // original Drive mime — drives the "Open in …" button
  updatedAt: Timestamp; // last content change (no-op syncs don't touch it)
  version: number;      // monotonic content version, starts at 1
  contentHash: string;  // SHA-256 of title|folderPath|markdown — no-op sync detection
  driveModifiedTime: string; // Drive's RFC3339 mtime at last sync — /reindex skip check
}
```

Each content change also writes an immutable snapshot to the `versions` subcollection:

```ts
// docs/{id}/versions/{000001…}  — doc id zero-padded so id order == numeric order
interface KaybeeDocVersion {
  version: number;
  title: string;
  folderPath: string;
  markdown: string;
  mimeType: string;
  contentHash: string;
  savedAt: Timestamp;
}
```

No migrations. Fields can be added freely — Firestore is schema-free. After a code change that affects how any of these fields are computed — or how Markdown/images are processed — run `POST /reindex?force=1` to backfill: `force` bypasses the modifiedTime skip so every file is re-exported, while the content-hash check still avoids pointless version snapshots. (Docs created before versioning get `version: 1` and their first snapshot on the next real content change.)

---

## Security

The `/sync` endpoint checks the `X-Sync-Secret` header against the `SYNC_SECRET` environment variable. Requests without a valid secret return `401` immediately — no Drive API calls are made.

---

## n8n Workflow Notes

- **Trigger:** Google Drive — "Watch Files in Folder" node, scoped to `ROOT_FOLDER_ID`
- **Action:** HTTP Request node → `POST https://<cloud-run-url>/sync/{{ $json.id }}`  with `X-Sync-Secret` header
- **Reconciler:** Separate scheduled workflow — "Drive List Files" → filter stale → loop → HTTP Request
- Polling interval for the trigger is configurable in n8n. Webhook mode (if n8n is publicly reachable) gets latency under 3 seconds.
