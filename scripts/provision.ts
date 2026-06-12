/**
 * One-command site provisioning — turns a fresh GCP project into a running
 * Kaybee site. One Shared Drive + one GCP project per site (IT KB, People, …).
 *
 *   bun run setup                          # first: pick drive, write .env
 *   bun run provision --project loop-it-kb # then: build the infrastructure
 *
 * Options:
 *   --project <id>     GCP project (default: GCP_PROJECT_ID from .env)
 *   --region <region>  default europe-west4
 *   --service <name>   Cloud Run service name, default kaybee
 *   --schedule <cron>  reindex interval, default every 5 minutes
 *   --iap              put Identity-Aware Proxy in front (Google sign-in)
 *
 * What it does (idempotent — safe to re-run):
 *   1. Enables the required APIs
 *   2. Creates the Firestore database and the private assets bucket
 *   3. Creates the kaybee-runtime service account + minimal IAM
 *   4. Deploys Cloud Run from source with the .env settings
 *   5. Creates a Cloud Scheduler job that POSTs /reindex on a tight loop
 *      (cheap: unchanged files are skipped, deleted files cleaned up)
 *
 * The one step it can't do: adding the service account to your Shared
 * Drive as a Viewer — it prints the email so you can.
 */
import path from 'node:path'
import { $ } from 'bun'

const ROOT = path.join(import.meta.dir, '..')
const ENV_PATH = path.join(ROOT, '.env')

interface Args {
  project?: string
  region: string
  service: string
  schedule: string
  iap: boolean
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2))
  const env = await readEnvFile()

  const project = args.project || env.GCP_PROJECT_ID
  if (!project) {
    fail('No project. Pass --project <id> or set GCP_PROJECT_ID via `bun run setup`.')
  }
  for (const key of ['ROOT_FOLDER_ID', 'SYNC_SECRET', 'GCS_BUCKET', 'FIRESTORE_DATABASE_ID']) {
    if (!env[key]) fail(`${key} missing from .env — run \`bun run setup\` first.`)
  }
  const bucket = env.GCS_BUCKET!
  const database = env.FIRESTORE_DATABASE_ID!
  const saName = 'kaybee-runtime'
  const saEmail = `${saName}@${project}.iam.gserviceaccount.com`

  banner(`Provisioning “${args.service}” in ${project} (${args.region})`)

  await assertGcloud()

  // 1 — APIs
  const apis = [
    'drive.googleapis.com',
    'calendar-json.googleapis.com',
    'firestore.googleapis.com',
    'run.googleapis.com',
    'storage.googleapis.com',
    'cloudscheduler.googleapis.com',
    'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com',
    'iam.googleapis.com',
  ]
  await step('Enable APIs', $`gcloud services enable ${apis} --project ${project}`.quiet())

  // 2 — Firestore + bucket
  if (await exists($`gcloud firestore databases describe --database ${database} --project ${project}`)) {
    skip(`Firestore database ${database} exists`)
  } else {
    await step(
      `Create Firestore database ${database}`,
      $`gcloud firestore databases create --database ${database} --location ${args.region} --type firestore-native --project ${project}`.quiet(),
    )
  }

  if (await exists($`gcloud storage buckets describe gs://${bucket} --project ${project}`)) {
    skip(`Bucket gs://${bucket} exists`)
  } else {
    await step(
      `Create bucket gs://${bucket}`,
      $`gcloud storage buckets create gs://${bucket} --project ${project} --location ${args.region} --uniform-bucket-level-access --public-access-prevention`.quiet(),
    )
  }

  // 3 — service account + IAM
  if (await exists($`gcloud iam service-accounts describe ${saEmail} --project ${project}`)) {
    skip(`Service account ${saEmail} exists`)
  } else {
    await step(
      `Create service account ${saName}`,
      $`gcloud iam service-accounts create ${saName} --display-name ${'Kaybee runtime'} --project ${project}`.quiet(),
    )
  }
  await step('Grant Firestore access (roles/datastore.user)',
    $`gcloud projects add-iam-policy-binding ${project} --member serviceAccount:${saEmail} --role roles/datastore.user --condition None --quiet`.quiet())
  await step('Grant bucket access (roles/storage.objectAdmin)',
    $`gcloud storage buckets add-iam-policy-binding gs://${bucket} --member serviceAccount:${saEmail} --role roles/storage.objectAdmin`.quiet())

  // 4 — deploy Cloud Run from source
  const deployFlags = [
    '--source', ROOT,
    '--service-account', saEmail,
    '--allow-unauthenticated',
    '--memory', '512Mi',
    '--set-env-vars', renderRunEnv(env, project),
    '--quiet',
  ]
  await step(
    `Deploy Cloud Run service ${args.service} (this builds from source — takes a few minutes)`,
    $`gcloud run deploy ${args.service} --project ${project} --region ${args.region} ${deployFlags}`,
  )

  const url = (
    await $`gcloud run services describe ${args.service} --project ${project} --region ${args.region} --format ${'value(status.url)'}`.text()
  ).trim()
  ok(`Service URL: ${url}`)

  // 5 — scheduler: the reconciler loop
  const job = `${args.service}-reindex`
  const header = `X-Sync-Secret=${env.SYNC_SECRET}`
  const jobFlags = [
    '--schedule', args.schedule,
    '--uri', `${url}/reindex`,
    '--http-method', 'POST',
    '--attempt-deadline', '540s',
  ]
  if (await exists($`gcloud scheduler jobs describe ${job} --project ${project} --location ${args.region}`)) {
    await step(`Update scheduler job ${job}`,
      $`gcloud scheduler jobs update http ${job} --project ${project} --location ${args.region} ${jobFlags} --update-headers ${header}`.quiet())
  } else {
    await step(`Create scheduler job ${job} (${args.schedule})`,
      $`gcloud scheduler jobs create http ${job} --project ${project} --location ${args.region} ${jobFlags} --headers ${header}`.quiet())
  }

  // 6 — optional IAP (Google sign-in in front of the site)
  if (args.iap) {
    const res = await $`gcloud beta run services update ${args.service} --project ${project} --region ${args.region} --iap --quiet`
      .nothrow()
      .quiet()
    if (res.exitCode === 0) {
      ok('IAP enabled on the service')
      info('Grant access per person or Google Group:')
      info(`  gcloud beta iap web add-iam-policy-binding \\`)
      info(`    --project ${project} --resource-type cloud-run \\`)
      info(`    --service ${args.service} --region ${args.region} \\`)
      info(`    --member group:people-team@yourdomain.com --role roles/iap.httpsResourceAccessor`)
    } else {
      console.warn('  ! Could not enable IAP automatically:')
      console.warn(indent(res.stderr.toString()))
      console.warn('  → See https://cloud.google.com/iap/docs/enabling-cloud-run')
    }
  }

  banner('Provisioned — two manual steps remain')
  console.log(`  1. In Google Drive, add this service account to the Shared Drive
     as a Viewer (Manage members):

        ${saEmail}

     (Also share any calendars in CALENDAR_IDS with it.)

  2. Kick the first index (or wait for the scheduler):

        curl -X POST -H "X-Sync-Secret: ${env.SYNC_SECRET}" ${url}/reindex

  Site: ${url}
`)
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    region: 'europe-west4',
    service: 'kaybee',
    schedule: '*/5 * * * *',
    iap: false,
  }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--project': args.project = argv[++i]; break
      case '--region': args.region = argv[++i] ?? args.region; break
      case '--service': args.service = argv[++i] ?? args.service; break
      case '--schedule': args.schedule = argv[++i] ?? args.schedule; break
      case '--iap': args.iap = true; break
    }
  }
  return args
}

/** Env vars for Cloud Run. ^##^ delimiter so values may contain commas. */
function renderRunEnv(env: Record<string, string>, project: string): string {
  const pairs: string[] = [`GCP_PROJECT_ID=${project}`]
  for (const key of [
    'FIRESTORE_DATABASE_ID',
    'GCS_BUCKET',
    'ROOT_FOLDER_ID',
    'SHARED_DRIVE_NAME',
    'SYNC_SECRET',
    'CALENDAR_IDS',
    'THEME',
  ]) {
    if (env[key]) pairs.push(`${key}=${env[key]}`)
  }
  return `^##^${pairs.join('##')}`
}

async function assertGcloud(): Promise<void> {
  if (!(await exists($`gcloud --version`))) {
    fail('gcloud CLI not found — install the Google Cloud SDK first.')
  }
  const account = (
    await $`gcloud auth list --filter status:ACTIVE --format ${'value(account)'}`.nothrow().text()
  ).trim()
  if (!account) fail('No active gcloud account — run `gcloud auth login` first.')
  info(`gcloud account  ${account.split('\n')[0]}`)
}

async function readEnvFile(): Promise<Record<string, string>> {
  const file = Bun.file(ENV_PATH)
  if (!(await file.exists())) {
    fail('.env not found — run `bun run setup` first.')
  }
  const out: Record<string, string> = {}
  for (const line of (await file.text()).split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) out[m[1]!] = m[2]!
  }
  return out
}

async function exists(cmd: ReturnType<typeof $>): Promise<boolean> {
  return (await cmd.nothrow().quiet()).exitCode === 0
}

async function step(label: string, cmd: ReturnType<typeof $>): Promise<void> {
  console.log(`  → ${label}`)
  const res = await cmd.nothrow()
  if (res.exitCode !== 0) {
    fail(`${label} failed:\n${indent(res.stderr.toString() || res.stdout.toString())}`)
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')
}

function banner(text: string): void {
  console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 60 - text.length))}`)
}
function info(text: string): void {
  console.log(`  ${text}`)
}
function ok(text: string): void {
  console.log(`  ✓ ${text}`)
}
function skip(text: string): void {
  console.log(`  ✓ ${text} — skipping`)
}
function fail(text: string): never {
  console.error(`\n  ✗ ${text}\n`)
  process.exit(1)
}

main().catch((err) => {
  console.error('[provision] Failed:', err)
  process.exit(1)
})
