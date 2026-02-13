import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertRunlifyAvailable, runRunlify } from '../../src/runner/index.js'

describe('runlify init', () => {
  let testDir: string

  beforeAll(() => {
    assertRunlifyAvailable()
  })

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlify-test-'))
    // runlify init expects .gitignore to exist
    fs.writeFileSync(path.join(testDir, '.gitignore'), '')
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('should create runlify.json when not exists', async () => {
    const result = await runRunlify(['init', 'test-project'], testDir)

    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(testDir, 'runlify.json'))).toBe(true)
  })

  it('should create runlify.developer.example.json', async () => {
    const result = await runRunlify(['init', 'test-project'], testDir)

    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(testDir, 'runlify.developer.example.json'))).toBe(true)
  })

  it('should contain project name in runlify.json', async () => {
    await runRunlify(['init', 'my-awesome-project'], testDir)

    const configPath = path.join(testDir, 'runlify.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>

    expect(config).toHaveProperty('projectName', 'my-awesome-project')
  })
})
