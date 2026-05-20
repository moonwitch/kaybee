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

# 2. one-time: copy env template
cp .env.example .env
# edit .env — see "Environment" below

# 3. install + run
bun install
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

Lists every supported file under `ROOT_FOLDER_ID`, exports each one, and writes it to Firestore. Logs `synced`, `failed`, and total in the response.

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
| `/calendar` | GET | Upcoming events from `CALENDAR_IDS` |
| `/search?q=` | GET | Keyword search |
| `/sync/:fileId` | POST | Sync one file (secret-protected) |
| `/reindex` | POST | Sweep ROOT_FOLDER_ID (secret-protected) |
| `/a/:hash.ext` | GET | GCS-backed image proxy |
| `/assets/*` | GET | Static assets (CSS, fonts, etc.) |
| `/healthz` | GET | Health check |

> Dev affordance: `/calendar?demo` renders the calendar view with fake events — useful when iterating on the design without real shares set up. Strip the branch in `routes.ts` if you don't want it shipped.

---

## Deploy

Auto-deploys to Cloud Run on push to `main` via `.github/workflows/google-cloudrun-source.yml`.

For near-instant updates after deploy, hook either:
- **n8n** — Drive trigger → `POST /sync/:fileId`
- **Cloud Scheduler** — periodic `POST /reindex` (e.g. every minute) as a safety net

Both can run together — sync is idempotent.

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
scripts/              # one-off scripts (seed)
docs/                 # agents.md, arch.md, design.md
lookbook/             # design reference (HTML mockups)
```
