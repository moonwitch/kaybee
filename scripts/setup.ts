/**
 * Interactive setup — creates the Kaybee config from a Google Shared Drive.
 *
 *   bun run setup                      # interactive
 *   bun run setup --drive "Loop Library"   # pre-select the drive by name
 *   bun run setup --yes                # accept all defaults (CI-friendly)
 *
 * What it does:
 *   1. Finds your service-account key and verifies Drive access
 *   2. Lists the Shared Drives the service account is a member of
 *   3. Lets you pick one and previews its top-level folders (= categories)
 *   4. Writes .env with ROOT_FOLDER_ID, SHARED_DRIVE_NAME, a generated
 *      SYNC_SECRET, and the GCP project settings
 *
 * Safe to re-run: existing .env values become the new defaults, and the
 * old file is backed up to .env.bak before writing.
 */
import crypto from 'node:crypto'
import path from 'node:path'
import { google, type drive_v3 } from 'googleapis'
import type { GaxiosResponse } from 'gaxios'

const ROOT = path.join(import.meta.dir, '..')
const ENV_PATH = path.join(ROOT, '.env')

interface Args {
  driveName?: string
  yes: boolean
}

interface SharedDrive {
  id: string
  name: string
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2))

  banner('Kaybee setup')

  // 1 — credentials
  const keyPath = await findServiceAccountKey()
  const key = (await Bun.file(keyPath).json()) as {
    client_email?: string
    project_id?: string
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath
  info(`Service account  ${key.client_email ?? '(unknown)'}`)
  info(`Key file         ${path.relative(ROOT, keyPath)}`)

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  const drive = google.drive({ version: 'v3', auth })

  // 2 — shared drives
  const drives = await listSharedDrives(drive)
  if (drives.length === 0) {
    fail(
      'The service account is not a member of any Shared Drive.\n' +
        `  → In Google Drive, open the Shared Drive → Manage members → add\n` +
        `    ${key.client_email ?? 'the service account'} as a Viewer, then re-run setup.`,
    )
  }

  // 3 — pick one
  const chosen = await chooseDrive(drives, args)
  ok(`Using Shared Drive “${chosen.name}” (${chosen.id})`)

  await previewCategories(drive, chosen)

  // 4 — config values
  const existing = await readExistingEnv()
  const projectId = await ask(
    'GCP project id',
    existing.GCP_PROJECT_ID || key.project_id || '',
    args.yes,
  )
  const databaseId = await ask(
    'Firestore database id',
    existing.FIRESTORE_DATABASE_ID || '(default)',
    args.yes,
  )
  const bucket = await ask(
    'GCS bucket for images',
    existing.GCS_BUCKET || (projectId ? `${projectId}-kaybee-assets` : ''),
    args.yes,
  )
  const calendarIds = await ask(
    'Calendar IDs (comma-separated, optional)',
    existing.CALENDAR_IDS || '',
    args.yes,
  )
  const syncSecret =
    existing.SYNC_SECRET || crypto.randomBytes(24).toString('hex')

  // 5 — write .env
  const env = renderEnv({
    GCP_PROJECT_ID: projectId,
    FIRESTORE_DATABASE_ID: databaseId,
    GCS_BUCKET: bucket,
    ROOT_FOLDER_ID: chosen.id,
    SHARED_DRIVE_NAME: chosen.name,
    SYNC_SECRET: syncSecret,
    CALENDAR_IDS: calendarIds,
    GOOGLE_APPLICATION_CREDENTIALS: path.relative(ROOT, keyPath),
  })

  if (await Bun.file(ENV_PATH).exists()) {
    await Bun.write(`${ENV_PATH}.bak`, Bun.file(ENV_PATH))
    info('Existing .env backed up to .env.bak')
  }
  await Bun.write(ENV_PATH, env)
  ok('Wrote .env')

  banner('Next steps')
  console.log(`  1. bun dev                 → http://localhost:8080
  2. bun run seed            (optional welcome doc)
  3. Index the drive:
       curl -X POST -H "X-Sync-Secret: ${syncSecret}" \\
         http://localhost:8080/reindex

  Deploying? Set these on Cloud Run (no key file needed there):
    GCP_PROJECT_ID, FIRESTORE_DATABASE_ID, GCS_BUCKET,
    ROOT_FOLDER_ID, SHARED_DRIVE_NAME, SYNC_SECRET${calendarIds ? ', CALENDAR_IDS' : ''}
`)
}

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--drive') args.driveName = argv[++i]
    else if (argv[i] === '--yes' || argv[i] === '-y') args.yes = true
  }
  return args
}

/** GOOGLE_APPLICATION_CREDENTIALS if set, else ./service-account.json. */
async function findServiceAccountKey(): Promise<string> {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (fromEnv) {
    const resolved = path.resolve(ROOT, fromEnv)
    if (await Bun.file(resolved).exists()) return resolved
    fail(`GOOGLE_APPLICATION_CREDENTIALS points at a missing file: ${fromEnv}`)
  }
  const fallback = path.join(ROOT, 'service-account.json')
  if (await Bun.file(fallback).exists()) return fallback
  fail(
    'No service-account key found.\n' +
      '  → Download a JSON key for your service account and save it as\n' +
      '    ./service-account.json (already gitignored), then re-run setup.',
  )
}

async function listSharedDrives(
  drive: ReturnType<typeof google.drive>,
): Promise<SharedDrive[]> {
  const out: SharedDrive[] = []
  let pageToken: string | undefined = undefined
  do {
    const resp: GaxiosResponse<drive_v3.Schema$DriveList> =
      await drive.drives.list({
        pageSize: 100,
        pageToken,
        fields: 'nextPageToken, drives(id, name)',
      })
    for (const d of resp.data.drives ?? []) {
      if (d.id && d.name) out.push({ id: d.id, name: d.name })
    }
    pageToken = resp.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

async function chooseDrive(
  drives: SharedDrive[],
  args: Args,
): Promise<SharedDrive> {
  if (args.driveName) {
    const hit = drives.find(
      (d) => d.name.toLowerCase() === args.driveName!.toLowerCase(),
    )
    if (hit) return hit
    fail(
      `No Shared Drive named “${args.driveName}”. Available: ` +
        drives.map((d) => d.name).join(', '),
    )
  }

  if (drives.length === 1) return drives[0]!

  console.log('\nShared Drives visible to this service account:')
  drives.forEach((d, i) => console.log(`  ${i + 1}. ${d.name}`))

  if (args.yes || !process.stdin.isTTY) return drives[0]!

  while (true) {
    const answer = prompt(`Pick a drive [1-${drives.length}]:`) ?? ''
    const n = Number(answer.trim())
    if (Number.isInteger(n) && n >= 1 && n <= drives.length) {
      return drives[n - 1]!
    }
    console.log('  Not a valid choice, try again.')
  }
}

/** Top-level folders become the site's categories — show them up front. */
async function previewCategories(
  drive: ReturnType<typeof google.drive>,
  chosen: SharedDrive,
): Promise<void> {
  try {
    const resp = await drive.files.list({
      q: `'${chosen.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(name)',
      pageSize: 50,
      corpora: 'drive',
      driveId: chosen.id,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: 'name',
    })
    const names = (resp.data.files ?? []).map((f) => f.name).filter(Boolean)
    if (names.length > 0) {
      info(`Top-level folders (your categories): ${names.join(', ')}`)
    } else {
      info('No top-level folders yet — docs will land under “Uncategorised”.')
    }
  } catch (err) {
    // Preview is a nicety; never block setup on it.
    console.warn('  (could not preview folders:', (err as Error).message + ')')
  }
}

async function readExistingEnv(): Promise<Record<string, string>> {
  const file = Bun.file(ENV_PATH)
  if (!(await file.exists())) return {}
  const out: Record<string, string> = {}
  for (const line of (await file.text()).split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) out[m[1]!] = m[2]!
  }
  return out
}

async function ask(
  label: string,
  fallback: string,
  acceptDefaults: boolean,
): Promise<string> {
  if (acceptDefaults || !process.stdin.isTTY) return fallback
  const suffix = fallback ? ` [${fallback}]` : ''
  const answer = prompt(`${label}${suffix}:`) ?? ''
  return answer.trim() || fallback
}

function renderEnv(values: Record<string, string>): string {
  const lines = [
    '# Generated by `bun run setup` — re-run it any time to reconfigure.',
    '# In production these are injected by Cloud Run.',
    '',
  ]
  for (const [k, v] of Object.entries(values)) lines.push(`${k}=${v}`)
  lines.push('')
  return lines.join('\n')
}

function banner(text: string): void {
  console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 50 - text.length))}`)
}
function info(text: string): void {
  console.log(`  ${text}`)
}
function ok(text: string): void {
  console.log(`  ✓ ${text}`)
}
function fail(text: string): never {
  console.error(`\n  ✗ ${text}\n`)
  process.exit(1)
}

main().catch((err) => {
  console.error('[setup] Failed:', err)
  process.exit(1)
})
