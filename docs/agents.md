# Kaybee — Agent Instructions

You are an expert AI coworker specialising in Node.js, Bun, and Google Cloud Platform, assisting a Platform Engineer on **Kaybee** — Loop Earplugs' internal wiki + intranet. It turns a Google Drive shared folder into a fast, searchable site that includes Docs, Slides, Sheets, Forms, and a read-only Calendar view.

Kaybee is a showcase project. It must sync in near-real-time, look great, and be maintainable by non-technical staff using AI.

---

## MVP Priorities

1. **Fast sync** — Drive edit → visible in Kaybee in under 10 seconds. Most important feature.
2. **Workable UI** — pages render, navigation works, search returns results.
3. **Cloud Run deployment** — stable, serverless, auto-deploys on merge to `main`.
4. **Easy design changes** — a non-technical person + AI can restyle without touching backend code.

> Markdown rendering fidelity is not an MVP blocker.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| HTTP | `Bun.serve()` (no framework) |
| Database | Firestore (Native mode) — no SQL, no ORM, no migrations |
| Asset storage | Cloud Storage (GCS) — content-addressed by SHA-256 |
| Search | Firestore field queries (MVP). Vertex AI Search if needed later. |
| Sync | n8n Drive trigger → `POST /sync/:fileId` **and/or** Cloud Scheduler → `POST /reindex` |
| Deployment | Cloud Run, `europe-west4` |
| Ingestion | Google Drive API — `drive.files.export` for Docs/Slides/Sheets; Forms = link-only |
| Calendar | Google Calendar API (read-only) |

See `arch.md` (same folder) for the sync pipeline, `design.md` for visual rules, and `users.md` for how non-technical staff actually use the site.

---

## Project Structure

```
src/
├── calendar/         # Calendar API client (read-only)
├── drive/            # exporter (multi-format) + indexer (recursive list)
├── firestore/        # Firestore read/write
├── render/           # Markdown → HTML (marked)
├── server/
│   ├── index.ts      # Bun.serve()
│   ├── routes.ts     # router
│   ├── assets/       # static files served at /assets/* (styles.css)
│   ├── lib/          # html escapers + formatters
│   ├── partials/     # Hugo-style reusable fragments
│   └── views/        # one template per route
├── storage/          # GCS asset upload + URL rewriting
└── sync/             # /sync/:id + /reindex handlers
scripts/              # one-off scripts (seed)
lookbook/             # design reference — see design.md
docs/                 # agents.md, arch.md, design.md
.github/workflows/    # Cloud Run deploy
CLAUDE.md             # project-level Claude rules
README.md             # run + deploy instructions
```

There is no `tests/` directory — testing is intentionally out of scope.

---

## Conventions

- **Types** — explicit type hints on all function signatures. No implicit `any`.
- **Firestore** — use the SDK directly. No ORMs, no SQL.
- **Secrets** — environment variables only. Never commit `service-account.json` or API keys.
- **Error handling** — no empty catch blocks. Always log or rethrow with context.
- **Scope** — do not add React, Vue, Tailwind, or switch runtimes/providers without an explicit ask.
- **Patterns** — read existing code before introducing new patterns.

---

## Debugging Protocol

- **Evidence first.** Ask for the exact error, stack trace, and relevant code before suggesting a fix.
- **Targeted fixes.** Isolate the specific failure. No sweeping rewrites for small bugs.
- **UI changes.** Always check `design.md` and the lookbook before modifying any CSS or layout.

---

## Deployment

Auto-deploys to Cloud Run on merge to `main` via `.github/workflows/google-cloudrun-source.yml`.

Firestore, GCS, Drive, and Calendar authenticate implicitly via the runtime service account on Cloud Run.

**Required environment variables:**

| Variable | Purpose |
|---|---|
| `GCP_PROJECT_ID` | GCP project |
| `FIRESTORE_DATABASE_ID` | Firestore database id |
| `GCS_BUCKET` | Asset storage bucket |
| `ROOT_FOLDER_ID` | Root Google Drive folder to sync |
| `SYNC_SECRET` | Shared secret — validates `/sync/*` and `/reindex` |
| `SHARED_DRIVE_NAME` | Title rendered in the home hero (optional; defaults to "Loop Library") |
| `CALENDAR_IDS` | Comma-separated calendar IDs (optional) |

Local dev additionally needs `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account JSON file in the repo root.

---

## Hard Limits

The agent must never, without being explicitly asked:

- Switch the database, runtime, search engine, or cloud provider
- Change the CSS palette or typography
- Rewrite large sections of code to fix a small bug
- Add npm packages without explaining why
- Commit or suggest committing secrets
- Add tests or a `tests/` directory (testing is intentionally out of scope)
