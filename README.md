# Kaybee

Internal wiki + intranet for Loop Earplugs. Turns the company Google Drive into a fast, searchable site that mirrors Google Docs, Slides, Sheets and Forms — plus a read-only Google Calendar view.

---

## Stack

- **Runtime:** Bun
- **HTTP:** `Bun.serve()` — no framework
- **Storage:** Firestore (docs) + Cloud Storage (images)
- **Source:** Google Drive API (Docs/Slides/Sheets/Forms) + Calendar API
- **Hosting:** Cloud Run, `europe-west4`

See `docs/users.md` for the end-user guide, `docs/arch.md` for the sync pipeline, `docs/design.md` for visual conventions, and `docs/agents.md` for AI agent guidance.

---

## Run locally

```bash
# 1. one-time: drop a service-account JSON key in the repo root
#    (already in .gitignore — never commit it)
cp ~/Downloads/your-sa.json ./service-account.json

# 2. one-time: create the config from your Shared Drive
bun install
bun run setup
# lists the Shared Drives the service account can see, lets you pick one,
# previews its top-level folders (your categories), and writes .env —
# including a generated SYNC_SECRET. Re-run any time; it keeps existing
# values as defaults and backs the old file up to .env.bak.
#
# prefer doing it by hand? cp .env.example .env and see "Environment" below

# 3. run
bun dev
# → http://localhost:8080

# 4. (optional) drop a welcome doc into Firestore so the home page has content
bun run seed
```

### Trigger a full reindex locally

```bash
curl -X POST \
  -H "X-Sync-Secret: $SYNC_SECRET" \
  http://localhost:8080/reindex
```

A reconciling sweep of `ROOT_FOLDER_ID`: files whose Drive `modifiedTime` hasn't moved since their last sync are **skipped** (one cheap listing instead of N exports), and docs that no longer exist in the Drive are **deleted** from Firestore together with their version history. The response reports `synced`, `skipped`, `deleted`, `failed`, and `total` — cheap enough to run every few minutes from Cloud Scheduler.

Add `?force=1` to bypass the skip and re-process every file — needed once after any change to the export/image pipeline (the content-hash check still prevents junk versions).

### Trigger a single-file sync

```bash
curl -X POST \
  -H "X-Sync-Secret: $SYNC_SECRET" \
  http://localhost:8080/sync/<DRIVE_FILE_ID>
```

This is what n8n calls on every Drive change for near-instant updates.

---

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | local only | Path to your service-account JSON. On Cloud Run the runtime SA is used automatically. |
| `GCP_PROJECT_ID` | ✓ | GCP project |
| `FIRESTORE_DATABASE_ID` | ✓ | Firestore database id (use `(default)` for the default db) |
| `GCS_BUCKET` | ✓ | Bucket for image assets — public-access-prevention enforced |
| `ROOT_FOLDER_ID` | ✓ | The Drive folder this instance serves |
| `SYNC_SECRET` | ✓ | Shared secret for `/sync/*` and `/reindex` |
| `SHARED_DRIVE_NAME` |   | Title shown in the home hero. Defaults to "Loop Library". Set per-deploy in Cloud Run. |
| `CALENDAR_IDS` |   | Comma-separated calendar IDs for the `/calendar` view |
| `THEME` |   | Per-site palette: `sun` (default) / `sky` / `meadow` / `blossom` / `midnight`. See `docs/design.md`. |

The service account needs:
- Drive: `drive.readonly` (and access to `ROOT_FOLDER_ID`)
- Calendar: `calendar.readonly` (and the calendars shared with it)
- Firestore + Storage IAM in the project

---

## Routes

| Path | Method | Description |
|---|---|---|
| `/` | GET | Home — recent docs + categories |
| `/doc/:id` | GET | Document reader |
| `/doc/:id/history` | GET | Version history — one entry per synced content change |
| `/doc/:id/v/:n` | GET | Read-only snapshot of version `n` |
| `/doc/:id/diff/:n` | GET | Line diff of version `n` against `n−1` |
| `/calendar` | GET | Upcoming events from `CALENDAR_IDS` |
| `/search?q=` | GET | Keyword search |
| `/sync/:fileId` | POST | Sync one file (secret-protected) |
| `/reindex` | POST | Sweep ROOT_FOLDER_ID (secret-protected) |
| `/a/:hash.ext` | GET | GCS-backed image proxy |
| `/assets/*` | GET | Static assets (CSS, fonts, etc.) |
| `/healthz` | GET | Health check |

> Dev affordance: `/calendar?demo` renders the calendar view with fake events — useful when iterating on the design without real shares set up. Strip the branch in `routes.ts` if you don't want it shipped.

---

## Version control

Every sync that actually changes a doc (title, folder, or body) bumps its `version` and stores an immutable snapshot in the `docs/{id}/versions` subcollection. Syncs that carry identical content are no-ops — `updatedAt` always means "last real edit", and scheduled reindex sweeps never pollute the history.

In the UI: every doc page has a **History** button → list of versions → view any snapshot read-only, or see a collapsed line diff of what changed in each version. See `docs/arch.md` for the snapshot schema.

---

## Deploy

Kaybee runs **one site per GCP project** — one for the IT KB, one for People, one per team. Standing up a new site is two commands:

```bash
bun run setup                            # pick the Shared Drive, write .env
bun run provision --project loop-it-kb   # build the GCP infrastructure
```

`provision` enables the APIs, creates the Firestore database, the private assets bucket, and the `kaybee-runtime` service account with minimal IAM, deploys Cloud Run from source, and creates a Cloud Scheduler job that hits `/reindex` every 5 minutes (configurable with `--schedule`). It's idempotent — re-run it after changing `.env`. Add `--iap` to put Google sign-in (Identity-Aware Proxy) in front of the site, with access managed per person or Google Group in IAM.

It prints the one manual step at the end: add the service-account email as a **Viewer** on the Shared Drive.

The repo also auto-deploys to Cloud Run on push to `main` via `.github/workflows/google-cloudrun-source.yml` (single-site; parametrise per site if you run several from one repo).

**Sync sources** (can run together — sync is idempotent):
- **Cloud Scheduler** — periodic `POST /reindex`. Created by `provision`; cheap because unchanged files are skipped. This is the default and is sufficient.
- **n8n** *(optional)* — Drive trigger → `POST /sync/:fileId` for sub-10-second updates.

---

## Project layout

```
src/
├── calendar/         # Calendar API client
├── drive/            # exporter (Docs/Slides/Sheets/Forms) + indexer
├── firestore/        # Firestore read/write
├── render/           # Markdown → HTML
├── server/
│   ├── index.ts      # Bun.serve()
│   ├── routes.ts     # router
│   ├── assets/       # static files served at /assets/* (styles.css)
│   ├── lib/          # html escapers + formatters
│   ├── partials/     # Hugo-style reusable fragments
│   │                 # (layout, topbar, footer, hero,
│   │                 #  breadcrumb, doc-card, cat-tile)
│   └── views/        # page templates per route
├── storage/          # GCS asset upload + URL rewriting
└── sync/             # /sync and /reindex handlers
scripts/              # one-off scripts (setup, seed)
docs/                 # agents.md, arch.md, design.md
lookbook/             # design reference (HTML mockups)
```
