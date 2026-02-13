import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type PreparedBackend, prepareBackend } from './prepare-backend.js'

describe('e2e: generated backend compiles', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend()
  }, 180000)

  afterAll(() => {
    if (prepared?.parentDir) fs.rmSync(prepared.parentDir, { recursive: true, force: true })
  })

  it('tsc --noEmit succeeds', () => {
    try {
      execSync('npx tsc --noEmit', {
        cwd: prepared.backDir,
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
        cwd: prepared.backDir,
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
    const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma', 'schema.prisma'), 'utf-8')

    expect(schema).toContain('datasource db')
    expect(schema).toContain('generator client')
    expect(schema).toContain('provider = "postgresql"')
  })

  it('generated Dockerfile is valid', () => {
    const dockerfile = fs.readFileSync(path.join(prepared.backDir, 'Dockerfile'), 'utf-8')

    expect(dockerfile).toContain('FROM')
    expect(dockerfile).toContain('COPY')
    expect(dockerfile).toContain('EXPOSE')
  })

  it('generated Helm chart has required fields', () => {
    const chart = fs.readFileSync(path.join(prepared.backDir, 'chart', 'Chart.yaml'), 'utf-8')

    expect(chart).toContain('apiVersion:')
    expect(chart).toContain('name:')
    expect(chart).toContain('version:')
  })
})
