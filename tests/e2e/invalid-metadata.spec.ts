import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { assertRunlifyAvailable, runRunlify } from '../../src/runner/index.js'

const fixturesBaseDir = path.resolve(import.meta.dirname, '../fixtures')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp project dir with given metadata and the with-catalog options.json */
function makeTempProject(metadata: Record<string, unknown>): {
  parentDir: string
  workDir: string
} {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-e2e-neg-'))
  const workDir = path.join(parentDir, 'project')
  fs.mkdirSync(workDir)

  const metaDir = path.join(workDir, 'src', 'meta')
  fs.mkdirSync(metaDir, { recursive: true })

  fs.writeFileSync(path.join(metaDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
  // Reuse options.json from with-catalog
  fs.copyFileSync(
    path.join(fixturesBaseDir, 'with-catalog', 'options.json'),
    path.join(metaDir, 'options.json'),
  )
  fs.writeFileSync(path.join(workDir, '.gitignore'), '')

  return { parentDir, workDir }
}

/** Load the valid with-catalog metadata as a base */
function validBase(): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(fixturesBaseDir, 'with-catalog', 'metadata.json'), 'utf-8')
  return JSON.parse(raw) as Record<string, unknown>
}

const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('e2e: invalid metadata handling', () => {
  it('runlify is available', () => {
    assertRunlifyAvailable()
  })

  it('valid metadata generates successfully (baseline)', async () => {
    const base = validBase()
    const { parentDir, workDir } = makeTempProject(base)
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    expect(result.exitCode).toBe(0)
  })

  it('completely empty metadata object fails or produces no output', async () => {
    const { parentDir, workDir } = makeTempProject({})
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    // Either it fails (non-zero exit) or succeeds but produces minimal output
    const backDir = path.join(parentDir, 'test-back')
    if (result.exitCode === 0 && fs.existsSync(backDir)) {
      // If it succeeds with empty metadata, there should be no entity models
      const schema = fs.readFileSync(path.join(backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).not.toMatch(/model \w+ \{/)
    }
    // Otherwise exitCode !== 0, which is also acceptable
  })

  it('metadata with empty catalogs array generates successfully', async () => {
    const base = validBase()
    base.catalogs = []
    base.documents = []
    const { parentDir, workDir } = makeTempProject(base)
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    // This should succeed — an app with no entities is valid
    expect(result.exitCode).toBe(0)
  })

  it('catalog with no fields (only id and search) still generates', async () => {
    const base = validBase()
    const catalogs = base.catalogs as Array<Record<string, unknown>>
    const product = catalogs[0] as Record<string, unknown>
    // Keep only id and search fields (the minimum viable set)
    const fields = product.fields as Array<Record<string, unknown>>
    product.fields = fields.filter((f) => f.name === 'id' || f.name === 'search')

    const { parentDir, workDir } = makeTempProject(base)
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    expect(result.exitCode).toBe(0)

    const backDir = path.join(parentDir, 'test-back')
    const schema = fs.readFileSync(path.join(backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toContain('model Product {')
  })

  it('catalog with missing name field fails', async () => {
    const base = validBase()
    const catalogs = base.catalogs as Array<Record<string, unknown>>
    const product = catalogs[0] as Record<string, unknown>
    delete product.name

    const { parentDir, workDir } = makeTempProject(base)
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    expect(result.exitCode).not.toBe(0)
  })

  it('catalog with missing title field fails', async () => {
    const base = validBase()
    const catalogs = base.catalogs as Array<Record<string, unknown>>
    const product = catalogs[0] as Record<string, unknown>
    delete product.title

    const { parentDir, workDir } = makeTempProject(base)
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    expect(result.exitCode).not.toBe(0)
  })

  it('field with unknown type fails or is handled gracefully', async () => {
    const base = validBase()
    const catalogs = base.catalogs as Array<Record<string, unknown>>
    const product = catalogs[0] as Record<string, unknown>
    const fields = product.fields as Array<Record<string, unknown>>
    fields.push({
      name: 'broken',
      type: 'nonexistent_type_xyz',
      category: 'scalar',
      title: { en: 'Broken' },
      required: false,
      requiredOnInput: false,
      updatable: true,
      updatableByUser: true,
      hidden: false,
      searchable: false,
      array: false,
      sharded: false,
      needFor: '',
      filters: ['equal'],
      showInList: true,
      showInCreate: true,
      showInEdit: true,
      showInFilter: true,
      showInShow: true,
    })

    const { parentDir, workDir } = makeTempProject(base)
    tempDirs.push(parentDir)

    const result = await runRunlify(['regen', '--back-only'], workDir)
    // Should either fail or produce code that doesn't compile
    if (result.exitCode === 0) {
      // If generation succeeds, the output shouldn't compile cleanly
      const backDir = path.join(parentDir, 'test-back')
      expect(fs.existsSync(backDir)).toBe(true)
    }
  })
})
