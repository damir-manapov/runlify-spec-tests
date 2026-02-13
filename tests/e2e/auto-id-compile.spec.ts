import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  teardownBackend,
} from './prepare-backend.js'

describe('e2e: auto-generated int id entity (with-auto-id)', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend('with-auto-id')
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

  it('Prisma schema has Item model with autoincrement id', () => {
    const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toContain('model Item {')
    expect(schema).toMatch(/id\s+Int/)
    expect(schema).toContain('@id')
    expect(schema).toContain('@default(autoincrement())')
  })

  it('Prisma schema has correct field types', () => {
    const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toMatch(/name\s+String/)
    expect(schema).toMatch(/quantity\s+Int/)
    expect(schema).toMatch(/active\s+Boolean/)
    expect(schema).toMatch(/description\s+String\?/)
    expect(schema).toMatch(/createdAt\s+DateTime\?/)
  })

  it('GraphQL typeDefs use Int for id and define correct field types', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/items/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('type Item {')
    expect(typeDefs).toContain('id: Int!')
    expect(typeDefs).toContain('name: String!')
    expect(typeDefs).toContain('quantity: Int!')
    expect(typeDefs).toContain('active: Boolean!')
    // optional fields
    expect(typeDefs).toContain('description: String')
    expect(typeDefs).toContain('createdAt: DateTime')
  })

  it('typeDefs do not require id on create mutation (auto-generated)', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/items/baseTypeDefs.ts'),
      'utf-8',
    )
    // createItem should NOT have id as required arg
    const createMatch = typeDefs.match(/createItem\(([^)]+)\)/s)
    expect(createMatch).toBeTruthy()
    const createArgs = createMatch?.[1]
    expect(createArgs).not.toMatch(/\bid\s*:\s*Int!/)
  })

  it('typeDefs define quantity filters (lte, gte)', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/items/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('input ItemFilter {')
    expect(typeDefs).toContain('quantity_lte: Int')
    expect(typeDefs).toContain('quantity_gte: Int')
  })

  it('typeDefs define datetime filters (lte, gte)', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/items/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('createdAt_lte: DateTime')
    expect(typeDefs).toContain('createdAt_gte: DateTime')
  })
})
