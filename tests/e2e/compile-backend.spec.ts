import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  teardownBackend,
} from './prepare-backend.js'

describe('e2e: generated backend compiles', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend('with-catalog')
  }, 180000)

  afterAll(() => {
    teardownBackend({ prepared })
  })

  it('tsc --noEmit succeeds', () => {
    runOrFail('tsc', 'npx tsc --noEmit', {
      cwd: prepared.backDir,
      timeout: 30000,
    })
  })

  it('prisma validate succeeds', () => {
    runOrFail('prisma validate', 'npx prisma validate', {
      cwd: prepared.backDir,
      timeout: 15000,
      env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
    })
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
