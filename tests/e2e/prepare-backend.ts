import { type ChildProcess, execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertRunlifyAvailable, runRunlify } from '../../src/runner/index.js'

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures/minimal')
const scaffoldDir = path.join(fixturesDir, 'scaffold')

export interface PreparedBackend {
  parentDir: string
  backDir: string
}

export interface StartedServer {
  process: ChildProcess
  port: number
  baseUrl: string
}

/**
 * Generate a backend with --back-only, overlay scaffold stubs,
 * install dependencies and generate Prisma client.
 *
 * Returns paths to the created directories for cleanup.
 */
export async function prepareBackend(): Promise<PreparedBackend> {
  assertRunlifyAvailable()

  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-e2e-'))
  const workDir = path.join(parentDir, 'project')
  fs.mkdirSync(workDir)

  const metaDir = path.join(workDir, 'src', 'meta')
  fs.mkdirSync(metaDir, { recursive: true })
  fs.copyFileSync(path.join(fixturesDir, 'metadata.json'), path.join(metaDir, 'metadata.json'))
  fs.copyFileSync(path.join(fixturesDir, 'options.json'), path.join(metaDir, 'options.json'))
  fs.writeFileSync(path.join(workDir, '.gitignore'), '')

  const result = await runRunlify(['regen', '--back-only'], workDir)
  if (result.exitCode !== 0) {
    throw new Error(`runlify regen failed (exit ${result.exitCode}):\n${result.stderr}`)
  }

  const backDir = path.join(parentDir, 'test-back')
  if (!fs.existsSync(backDir)) {
    throw new Error(`Expected ${backDir} to exist after regen`)
  }

  // Overlay scaffold stubs (don't overwrite generated files)
  copyDirRecursive(scaffoldDir, backDir, false)

  // Force-overwrite specific generated files with stubs:
  // - tracing.ts: avoids heavy OpenTelemetry dependencies
  // - config/config.ts: adds infrastructure fields that getPrisma/getQueue expect
  for (const rel of ['src/tracing.ts', 'src/config/config.ts']) {
    const src = path.join(scaffoldDir, rel)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backDir, rel))
    }
  }

  // Install dependencies
  execSync('npm install --ignore-scripts', {
    cwd: backDir,
    stdio: 'pipe',
    timeout: 120000,
  })

  // Generate Prisma client
  execSync('npx prisma generate', {
    cwd: backDir,
    stdio: 'pipe',
    timeout: 30000,
    env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
  })

  return { parentDir, backDir }
}

/** Start the test server via tsx, return the process and the port it listens on. */
export function startServer(cwd: string): Promise<StartedServer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server did not start within 15s'))
    }, 15000)

    const proc = spawn('npx', ['tsx', 'src/test-server.ts'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
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

/** Remove the temp directory created by prepareBackend. */
export function cleanupPrepared(prepared: PreparedBackend | undefined): void {
  if (prepared?.parentDir) fs.rmSync(prepared.parentDir, { recursive: true, force: true })
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
