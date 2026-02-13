import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  teardownBackend,
} from './prepare-backend.js'

describe('e2e: linked entities (with-relations)', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend('with-relations')
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

  it('Prisma schema has both Category and Article models', () => {
    const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toContain('model Category {')
    expect(schema).toContain('model Article {')
  })

  it('Prisma schema Article has categoryId with @relation', () => {
    const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma/schema.prisma'), 'utf-8')
    // Article should have a categoryId field referencing Category
    expect(schema).toMatch(/categoryId\s+String\?/)
    expect(schema).toContain('@relation')
  })

  it('GraphQL typeDefs define Category type', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/categories/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('type Category {')
    expect(typeDefs).toContain('id: ID!')
    expect(typeDefs).toContain('name: String!')
  })

  it('GraphQL typeDefs define Article type with categoryId', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/articles/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('type Article {')
    expect(typeDefs).toContain('id: ID!')
    expect(typeDefs).toContain('title: String!')
    expect(typeDefs).toContain('categoryId: String')
  })

  it('Article filter has categoryId with in/not_in filters', () => {
    const typeDefs = fs.readFileSync(
      path.join(prepared.backDir, 'src/adm/graph/services/articles/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('input ArticleFilter {')
    expect(typeDefs).toContain('categoryId: String')
    expect(typeDefs).toContain('categoryId_in: [String]')
    expect(typeDefs).toContain('categoryId_not_in: [String]')
  })

  it('Entity.ts exports both Category and Article', () => {
    const entityTs = fs.readFileSync(path.join(prepared.backDir, 'src/types/Entity.ts'), 'utf-8')
    expect(entityTs).toContain('Category')
    expect(entityTs).toContain('Article')
  })
})
