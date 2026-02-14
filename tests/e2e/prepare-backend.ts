import { type ChildProcess, execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertRunlifyAvailable, runRunlify } from '../../src/runner/index.js'

const fixturesBaseDir = path.resolve(import.meta.dirname, '../fixtures')

export interface PreparedBackend {
  parentDir: string
  backDir: string
}

export interface StartedServer {
  process: ChildProcess
  port: number
  baseUrl: string
}

export interface TempProject {
  parentDir: string
  workDir: string
}

/**
 * Create a temp directory with the standard project layout
 * (src/meta/metadata.json, src/meta/options.json, .gitignore).
 *
 * Two call styles:
 *  - `makeTempProject(fixture)` — copy metadata + options from the named fixture.
 *  - `makeTempProject(fixture, metadata)` — write the supplied metadata object;
 *    options.json is still copied from the fixture.
 */
export function makeTempProject(fixture: string, metadata?: Record<string, unknown>): TempProject {
  const fixturesDir = path.join(fixturesBaseDir, fixture)

  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-e2e-'))
  const workDir = path.join(parentDir, 'project')
  fs.mkdirSync(workDir)

  const metaDir = path.join(workDir, 'src', 'meta')
  fs.mkdirSync(metaDir, { recursive: true })

  if (metadata) {
    fs.writeFileSync(path.join(metaDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
  } else {
    fs.copyFileSync(path.join(fixturesDir, 'metadata.json'), path.join(metaDir, 'metadata.json'))
  }
  fs.copyFileSync(path.join(fixturesDir, 'options.json'), path.join(metaDir, 'options.json'))
  fs.writeFileSync(path.join(workDir, '.gitignore'), '')

  return { parentDir, workDir }
}

// ---------------------------------------------------------------------------
// File-reading helpers shared across spec files
// ---------------------------------------------------------------------------

/** Read the Prisma schema from a generated backend. */
export function readSchema(backDir: string): string {
  return fs.readFileSync(path.join(backDir, 'prisma/schema.prisma'), 'utf-8')
}

/** Read the baseTypeDefs.ts for a given graph service. */
export function readTypeDefs(backDir: string, service: string): string {
  return fs.readFileSync(
    path.join(backDir, `src/adm/graph/services/${service}/baseTypeDefs.ts`),
    'utf-8',
  )
}

/** Read metadata.json from a workDir (project with src/meta layout). */
export function readMetadata(workDir: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(workDir, 'src/meta/metadata.json'), 'utf-8'),
  ) as Record<string, unknown>
}

/** Write metadata.json to a workDir. */
export function writeMetadata(workDir: string, metadata: Record<string, unknown>): void {
  fs.writeFileSync(path.join(workDir, 'src/meta/metadata.json'), JSON.stringify(metadata, null, 2))
}

/** Read metadata.json directly from a fixture directory (not a workDir). */
export function readFixtureMetadata(fixture: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(fixturesBaseDir, fixture, 'metadata.json'), 'utf-8')
  return JSON.parse(raw) as Record<string, unknown>
}

/**
 * Generate a backend with --back-only, overlay scaffold stubs,
 * install dependencies and generate Prisma client.
 *
 * Results are cached by fixture name so the expensive regen + npm install
 * only runs once per fixture across all spec files in the same worker.
 *
 * @param fixture - Name of the fixture directory under tests/fixtures/ (default: 'minimal')
 * Returns paths to the created directories for cleanup.
 */
const prepareCache = new Map<string, Promise<PreparedBackend>>()
/** Sync side-channel so the process-exit handler can access resolved values */
const resolvedBackends = new Map<string, PreparedBackend>()

export function prepareBackend(fixture = 'minimal'): Promise<PreparedBackend> {
  const cached = prepareCache.get(fixture)
  if (cached) return cached

  const promise = doPrepare(fixture).then((prepared) => {
    resolvedBackends.set(fixture, prepared)
    return prepared
  })
  prepareCache.set(fixture, promise)
  return promise
}

async function doPrepare(fixture: string): Promise<PreparedBackend> {
  assertRunlifyAvailable()

  const scaffoldDir = path.join(fixturesBaseDir, 'scaffold')
  const { parentDir, workDir } = makeTempProject(fixture)

  const result = await runRunlify(['regen', '--back-only'], workDir)
  if (result.exitCode !== 0) {
    throw new Error(`runlify regen failed (exit ${result.exitCode}):\n${result.stderr}`)
  }

  const backDir = path.join(parentDir, 'test-back')
  if (!fs.existsSync(backDir)) {
    throw new Error(`Expected ${backDir} to exist after regen`)
  }

  overlayScaffold(scaffoldDir, backDir)
  installAndGenerate(backDir)

  const prepared: PreparedBackend = { parentDir, backDir }
  return prepared
}

// ---------------------------------------------------------------------------
// Fresh (uncached) prepare + re-regen for schema-change tests
// ---------------------------------------------------------------------------

export interface FreshBackend extends PreparedBackend {
  /** The project dir containing src/meta/metadata.json — mutate this for schema changes */
  workDir: string
}

/**
 * Cache of "template" fresh backends keyed by fixture name.
 * The template is built once (expensive: regen + npm install) and then
 * cloned cheaply via cp -r for each suite that needs a mutable copy.
 */
const freshTemplateCache = new Map<string, Promise<FreshBackend>>()
const resolvedFreshTemplates = new Map<string, FreshBackend>()

async function buildFreshTemplate(fixture: string): Promise<FreshBackend> {
  assertRunlifyAvailable()

  const scaffoldDir = path.join(fixturesBaseDir, 'scaffold')
  const { parentDir, workDir } = makeTempProject(fixture)

  const result = await runRunlify(['regen', '--back-only'], workDir)
  if (result.exitCode !== 0) {
    throw new Error(`runlify regen failed (exit ${result.exitCode}):\n${result.stderr}`)
  }

  const backDir = path.join(parentDir, 'test-back')
  if (!fs.existsSync(backDir)) {
    throw new Error(`Expected ${backDir} to exist after regen`)
  }

  overlayScaffold(scaffoldDir, backDir)
  installAndGenerate(backDir)

  return { parentDir, backDir, workDir }
}

function getFreshTemplate(fixture: string): Promise<FreshBackend> {
  const cached = freshTemplateCache.get(fixture)
  if (cached) return cached

  const promise = buildFreshTemplate(fixture).then((tpl) => {
    resolvedFreshTemplates.set(fixture, tpl)
    return tpl
  })
  freshTemplateCache.set(fixture, promise)
  return promise
}

/**
 * Get a fresh (mutable) backend for schema-change tests.
 *
 * The expensive work (regen + npm install + prisma generate) is done once
 * per fixture and cached as a template. Each call clones that template
 * via cp -r, which is near-instant.
 */
export async function prepareBackendFresh(fixture: string): Promise<FreshBackend> {
  const template = await getFreshTemplate(fixture)

  // Clone the template into a new temp dir
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-e2e-'))
  fs.cpSync(template.parentDir, parentDir, { recursive: true })

  const workDir = path.join(parentDir, 'project')
  const backDir = path.join(parentDir, 'test-back')

  return { parentDir, backDir, workDir }
}

/**
 * Re-run runlify regen + prisma generate + genGQSchemes on an already-prepared
 * fresh backend. Call after mutating metadata.json in workDir.
 */
export async function regenBackend(fresh: FreshBackend): Promise<void> {
  const scaffoldDir = path.join(fixturesBaseDir, 'scaffold')

  const result = await runRunlify(['regen', '--back-only'], fresh.workDir)
  if (result.exitCode !== 0) {
    throw new Error(`runlify regen failed (exit ${result.exitCode}):\n${result.stderr}`)
  }

  overlayScaffold(scaffoldDir, fresh.backDir)
  removeStaleEntityDirs(fresh)

  execSync('npx prisma generate', {
    cwd: fresh.backDir,
    stdio: 'pipe',
    timeout: 30000,
    env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
  })
  execSync('npx tsx src/gen/genGQSchemes.ts', {
    cwd: fresh.backDir,
    stdio: 'pipe',
    timeout: 30000,
  })
}

/** Clean up a fresh (uncached) backend — always removes the temp dir. */
export function cleanupFresh(fresh: FreshBackend | undefined): void {
  if (!fresh?.parentDir) return
  fs.rmSync(fresh.parentDir, { recursive: true, force: true })
}

/**
 * Remove entity service/graph directories that are no longer in metadata.
 * runlify regen overlays new code but never deletes old artefacts — orphan
 * dirs cause tsc failures because they import types that no longer exist.
 */
function removeStaleEntityDirs(fresh: FreshBackend): void {
  const metaPath = path.join(fresh.workDir, 'src/meta/metadata.json')
  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

  const activeEntities = new Set<string>()
  for (const c of (metadata.catalogs ?? []) as { name: string }[]) {
    activeEntities.add(c.name)
  }
  for (const d of (metadata.documents ?? []) as { name: string }[]) {
    activeEntities.add(d.name)
  }
  for (const r of (metadata.infoRegistries ?? []) as { name: string }[]) {
    activeEntities.add(r.name)
  }
  for (const r of (metadata.sumRegistries ?? []) as { name: string }[]) {
    activeEntities.add(r.name)
  }

  removeStaleGraphDirs(fresh.backDir, activeEntities)
  removeStaleServiceDirs(fresh.backDir, activeEntities)
}

/** Built-in (non-entity) service/graph dirs that must never be removed. */
const builtInServiceDirs = new Set(['help'])
const builtInServiceClassDirs = new Set(['HelpService'])

function removeStaleGraphDirs(backDir: string, activeEntities: Set<string>): void {
  const graphServicesDir = path.join(backDir, 'src/adm/graph/services')
  if (!fs.existsSync(graphServicesDir)) return
  for (const dir of fs.readdirSync(graphServicesDir)) {
    if (builtInServiceDirs.has(dir)) continue
    if (!activeEntities.has(dir)) {
      fs.rmSync(path.join(graphServicesDir, dir), { recursive: true, force: true })
    }
  }
}

function removeStaleServiceDirs(backDir: string, activeEntities: Set<string>): void {
  const servicesDir = path.join(backDir, 'src/adm/services')
  if (!fs.existsSync(servicesDir)) return
  for (const entry of fs.readdirSync(servicesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('Service')) continue
    if (builtInServiceClassDirs.has(entry.name)) continue
    const entityPlural = entry.name.replace(/Service$/, '').toLowerCase()
    if (!activeEntities.has(entityPlural)) {
      fs.rmSync(path.join(servicesDir, entry.name), { recursive: true, force: true })
    }
  }
}

/** Overlay scaffold stubs and force-overwrite key files. */
function overlayScaffold(scaffoldDir: string, backDir: string): void {
  copyDirRecursive(scaffoldDir, backDir, false)

  // Only files where runlify generates a different version need force-overwrite.
  // Scaffold-only files (types.ts, context.ts, DocumentBaseService.ts,
  // test-server.ts, config/index.ts) are already placed by copyDirRecursive
  // since runlify doesn't generate them — no conflict to resolve.
  const forceOverwriteFiles = [
    'src/tracing.ts',
    'src/index.ts',
    'src/config/config.ts',
    'src/init/common/initEntities.ts',
  ]
  for (const rel of forceOverwriteFiles) {
    const src = path.join(scaffoldDir, rel)
    if (fs.existsSync(src)) {
      const dest = path.join(backDir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    }
  }
}

/** Install deps + generate Prisma client + generate GQL schemes. */
function installAndGenerate(backDir: string): void {
  execSync('npm install --ignore-scripts', { cwd: backDir, stdio: 'pipe', timeout: 120000 })
  execSync('npx prisma generate', {
    cwd: backDir,
    stdio: 'pipe',
    timeout: 30000,
    env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
  })
  execSync('npx tsx src/gen/genGQSchemes.ts', { cwd: backDir, stdio: 'pipe', timeout: 30000 })
}

/** Start the test server via tsx, return the process and the port it listens on. */
export function startServer(cwd: string, databaseUrl?: string): Promise<StartedServer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server did not start within 15s'))
    }, 15000)

    const proc = spawn('npx', ['tsx', 'src/test-server.ts'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...(databaseUrl ? { DATABASE_MAIN_WRITE_URI: databaseUrl } : {}),
      },
    })

    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      try {
        const parsed = JSON.parse(line)
        if (typeof parsed.port === 'number') {
          clearTimeout(timeout)
          resolve({
            process: proc,
            port: parsed.port,
            baseUrl: `http://localhost:${parsed.port}`,
          })
        }
      } catch {
        // Not our JSON line, ignore
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== null && code !== 0) {
        reject(new Error(`Server exited with code ${code}:\n${stderr}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/** Send SIGTERM and wait for the process to exit (up to 5s). */
export async function stopServer(server: StartedServer | undefined): Promise<void> {
  if (!server?.process) return
  server.process.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    server.process.on('close', () => resolve())
    setTimeout(resolve, 5000)
  })
}

/**
 * Remove the temp directory created by prepareBackend.
 *
 * When the backend is cached (shared across spec files) this is a no-op —
 * cleanup happens via cleanupAllPrepared after all suites finish.
 */
export function cleanupPrepared(prepared: PreparedBackend | undefined): void {
  if (!prepared?.parentDir) return
  // Skip if this is a cached (shared) backend — cleaned up by cleanupAllPrepared
  for (const cached of resolvedBackends.values()) {
    if (cached.parentDir === prepared.parentDir) return
  }
  fs.rmSync(prepared.parentDir, { recursive: true, force: true })
}

/** Remove all cached prepared backends. Called at process exit. */
export function cleanupAllPrepared(): void {
  for (const prepared of resolvedBackends.values()) {
    fs.rmSync(prepared.parentDir, { recursive: true, force: true })
  }
  prepareCache.clear()
  resolvedBackends.clear()

  for (const tpl of resolvedFreshTemplates.values()) {
    fs.rmSync(tpl.parentDir, { recursive: true, force: true })
  }
  freshTemplateCache.clear()
  resolvedFreshTemplates.clear()
}

// Auto-cleanup cached backends when the process exits
process.on('exit', cleanupAllPrepared)

// ---------------------------------------------------------------------------
// High-level setup/teardown helpers to reduce boilerplate in spec files
// ---------------------------------------------------------------------------

export interface SetupBackendResult {
  prepared: PreparedBackend
  dbUrl: string
}

export interface SetupServerResult extends SetupBackendResult {
  server: StartedServer
}

/**
 * Prepare a backend and optionally push the Prisma schema to a DB schema.
 * Use for specs that need the generated code + DB but no running server.
 */
export async function setupBackend(fixture: string, schema: string): Promise<SetupBackendResult> {
  const { databaseUrl } = await import('./graphql-client.js')
  const prepared = await prepareBackend(fixture)
  const dbUrl = databaseUrl(schema)

  runOrFail('prisma db push', 'npx prisma db push --force-reset --accept-data-loss', {
    cwd: prepared.backDir,
    timeout: 30000,
    env: { ...process.env, DATABASE_MAIN_WRITE_URI: dbUrl },
  })

  return { prepared, dbUrl }
}

/**
 * Prepare a backend, push schema, and start the GraphQL server.
 * Use for specs that test the running API.
 */
export async function setupServer(fixture: string, schema: string): Promise<SetupServerResult> {
  const result = await setupBackend(fixture, schema)
  const server = await startServer(result.prepared.backDir, result.dbUrl)
  return { ...result, server }
}

/** Teardown counterpart for setupServer */
export async function teardownServer(ctx: Partial<SetupServerResult>): Promise<void> {
  await stopServer(ctx.server)
  cleanupPrepared(ctx.prepared)
}

/** Teardown counterpart for setupBackend */
export function teardownBackend(ctx: Partial<SetupBackendResult>): void {
  cleanupPrepared(ctx.prepared)
}

/** Run a shell command, throwing a descriptive error on failure. */
export function runOrFail(
  label: string,
  command: string,
  options: Parameters<typeof execSync>[1],
): void {
  try {
    execSync(command, { stdio: 'pipe', ...options })
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer }
    const stdout = e.stdout?.toString() ?? ''
    const stderr = e.stderr?.toString() ?? ''
    throw new Error(`${label} failed:\n${stdout}\n${stderr}`)
  }
}

/** Recursively copy srcDir into destDir. If overwrite=false, skip existing files. */
function copyDirRecursive(srcDir: string, destDir: string, overwrite: boolean) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDirRecursive(srcPath, destPath, overwrite)
    } else {
      if (!overwrite && fs.existsSync(destPath)) continue
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
