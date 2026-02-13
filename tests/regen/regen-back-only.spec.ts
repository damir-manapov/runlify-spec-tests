import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertRunlifyAvailable, runRunlify } from '../../src/runner/index.js'

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures/minimal')

function copyFixture(targetDir: string) {
  const metaDir = path.join(targetDir, 'src', 'meta')
  fs.mkdirSync(metaDir, { recursive: true })
  fs.copyFileSync(path.join(fixturesDir, 'metadata.json'), path.join(metaDir, 'metadata.json'))
  fs.copyFileSync(path.join(fixturesDir, 'options.json'), path.join(metaDir, 'options.json'))
}

describe('runlify regen --back-only', () => {
  let testDir: string
  let backDir: string
  let uiDir: string

  beforeAll(() => {
    assertRunlifyAvailable()
  })

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-regen-test-'))
    copyFixture(testDir)
    fs.writeFileSync(path.join(testDir, '.gitignore'), '')

    // runlify creates sibling directories: <prefix>-back and <prefix>-ui
    const parentDir = path.dirname(testDir)
    backDir = path.join(parentDir, 'test-back')
    uiDir = path.join(parentDir, 'test-ui')
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
    fs.rmSync(backDir, { recursive: true, force: true })
    fs.rmSync(uiDir, { recursive: true, force: true })
  })

  it('should exit with code 0', async () => {
    const result = await runRunlify(['regen', '--back-only'], testDir)

    expect(result.exitCode).toBe(0)
  })

  it('should generate backend files', async () => {
    await runRunlify(['regen', '--back-only'], testDir)

    expect(fs.existsSync(path.join(backDir, 'prisma', 'schema.prisma'))).toBe(true)
    expect(fs.existsSync(path.join(backDir, 'src'))).toBe(true)
    expect(fs.existsSync(path.join(backDir, 'chart'))).toBe(true)
  })

  it('should not generate UI source files', async () => {
    await runRunlify(['regen', '--back-only'], testDir)

    expect(fs.existsSync(uiDir)).toBe(false)
  })
})
