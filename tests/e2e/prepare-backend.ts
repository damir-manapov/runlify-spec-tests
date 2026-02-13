import { execSync } from 'node:child_process'
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
