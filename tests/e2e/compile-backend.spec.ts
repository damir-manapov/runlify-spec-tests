import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertRunlifyAvailable, runRunlify } from '../../src/runner/index.js'

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures/minimal')
const scaffoldDir = path.join(fixturesDir, 'scaffold')

describe('e2e: generated backend compiles', () => {
  let parentDir: string
  let workDir: string
  let backDir: string

  beforeAll(async () => {
    assertRunlifyAvailable()

    // Create an isolated parent dir so test-back sibling lands inside it
    parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-e2e-'))
    workDir = path.join(parentDir, 'project')
    fs.mkdirSync(workDir)

    const metaDir = path.join(workDir, 'src', 'meta')
    fs.mkdirSync(metaDir, { recursive: true })
    fs.copyFileSync(path.join(fixturesDir, 'metadata.json'), path.join(metaDir, 'metadata.json'))
    fs.copyFileSync(path.join(fixturesDir, 'options.json'), path.join(metaDir, 'options.json'))
    fs.writeFileSync(path.join(workDir, '.gitignore'), '')

    // Run regen --back-only
    const result = await runRunlify(['regen', '--back-only'], workDir)
    if (result.exitCode !== 0) {
      throw new Error(`runlify regen failed (exit ${result.exitCode}):\n${result.stderr}`)
    }

    // runlify creates <prefix>-back as sibling of the working directory
    backDir = path.join(parentDir, 'test-back')
    if (!fs.existsSync(backDir)) {
      throw new Error(`Expected ${backDir} to exist after regen`)
    }

    // Copy scaffold files (stubs, package.json, tsconfig) into the generated backend.
    // Scaffold files are NOT overwritten if runlify already generated them.
    copyDirRecursive(scaffoldDir, backDir, false)

    // Overwrite specific generated files with stubs:
    // - tracing.ts: avoids heavy OpenTelemetry dependencies
    // - config/config.ts: adds infrastructure fields (databaseMainWriteUri etc.)
    //   that getPrisma/getQueue expect but the minimal metadata doesn't produce
    const forceOverwrite = ['src/tracing.ts', 'src/config/config.ts']
    for (const rel of forceOverwrite) {
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

    // Generate Prisma client from the generated schema
    execSync('npx prisma generate', {
      cwd: backDir,
      stdio: 'pipe',
      timeout: 30000,
      env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
    })
  }, 180000)

  afterAll(() => {
    if (parentDir) fs.rmSync(parentDir, { recursive: true, force: true })
  })

  it('tsc --noEmit succeeds', () => {
    try {
      execSync('npx tsc --noEmit', {
        cwd: backDir,
        stdio: 'pipe',
        timeout: 30000,
      })
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer }
      const stdout = e.stdout?.toString() ?? ''
      const stderr = e.stderr?.toString() ?? ''
      throw new Error(`tsc failed:\n${stdout}\n${stderr}`)
    }
  })

  it('prisma validate succeeds', () => {
    try {
      execSync('npx prisma validate', {
        cwd: backDir,
        stdio: 'pipe',
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer }
      const stdout = e.stdout?.toString() ?? ''
      const stderr = e.stderr?.toString() ?? ''
      throw new Error(`prisma validate failed:\n${stdout}\n${stderr}`)
    }
  })

  it('generated Prisma schema has datasource and generator', () => {
    const schema = fs.readFileSync(path.join(backDir, 'prisma', 'schema.prisma'), 'utf-8')

    expect(schema).toContain('datasource db')
    expect(schema).toContain('generator client')
    expect(schema).toContain('provider = "postgresql"')
  })

  it('generated Dockerfile is valid', () => {
    const dockerfile = fs.readFileSync(path.join(backDir, 'Dockerfile'), 'utf-8')

    expect(dockerfile).toContain('FROM')
    expect(dockerfile).toContain('COPY')
    expect(dockerfile).toContain('EXPOSE')
  })

  it('generated Helm chart has required fields', () => {
    const chart = fs.readFileSync(path.join(backDir, 'chart', 'Chart.yaml'), 'utf-8')

    expect(chart).toContain('apiVersion:')
    expect(chart).toContain('name:')
    expect(chart).toContain('version:')
  })
})

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
