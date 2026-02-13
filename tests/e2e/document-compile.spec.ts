import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  teardownBackend,
} from './prepare-backend.js'

describe('e2e: document entity type (with-document)', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend('with-document')
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

  it('Prisma schema has Order model with correct fields', () => {
    const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toContain('model Order {')
    expect(schema).toMatch(/id\s+String/)
    expect(schema).toContain('@id')
    expect(schema).toMatch(/date\s+DateTime/)
    expect(schema).toMatch(/code\s+String/)
    expect(schema).toMatch(/total\s+Float/)
    expect(schema).toMatch(/notes\s+String\?/)
  })

  it('GraphQL typeDefs define Order type with correct scalar types', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/orders/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('type Order {')
    expect(typeDefs).toContain('id: ID!')
    expect(typeDefs).toContain('date: DateTime!')
    expect(typeDefs).toContain('code: String!')
    expect(typeDefs).toContain('total: Float!')
    // optional field
    expect(typeDefs).toContain('notes: String')
  })

  it('typeDefs define date filters (lte, gte)', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/orders/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('input OrderFilter {')
    expect(typeDefs).toContain('date_lte: DateTime')
    expect(typeDefs).toContain('date_gte: DateTime')
  })

  it('typeDefs define total (Float) filters (lte, gte)', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/orders/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('total_lte: Float')
    expect(typeDefs).toContain('total_gte: Float')
  })

  it('create mutation requires date field', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/orders/baseTypeDefs.ts'),
      'utf-8',
    )
    const createMatch = typeDefs.match(/createOrder\(([^)]+)\)/s)
    expect(createMatch).toBeTruthy()
    const createArgs = createMatch![1]
    expect(createArgs).toContain('date:')
  })

  it('Entity.ts exports Order', () => {
    const entityTs = fs.readFileSync(path.join(prepared.backDir, 'src/types/Entity.ts'), 'utf-8')
    expect(entityTs).toContain('Order')
  })
})
