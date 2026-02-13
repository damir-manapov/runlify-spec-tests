import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type PreparedBackend, prepareBackend } from './prepare-backend.js'

describe('e2e: generated backend runs', () => {
  let prepared: PreparedBackend
  let serverProcess: ChildProcess | undefined
  let baseUrl: string

  beforeAll(async () => {
    prepared = await prepareBackend()

    // Start the test server and wait for the port
    const port = await startServer(prepared.backDir)
    baseUrl = `http://localhost:${port}`
  }, 180000)

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        serverProcess?.on('close', () => resolve())
        setTimeout(resolve, 5000)
      })
    }
    if (prepared?.parentDir) fs.rmSync(prepared.parentDir, { recursive: true, force: true })
  })

  it('server starts and /healthz returns ok', async () => {
    const res = await fetch(`${baseUrl}/healthz`)

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('unknown routes return 404', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`)

    expect(res.status).toBe(404)
  })

  it('/api routes have rate limit headers', async () => {
    const res = await fetch(`${baseUrl}/api/anything`)

    // express-rate-limit sets RateLimit-* headers (standardHeaders: true)
    const limitHeader = res.headers.get('ratelimit-limit')
    expect(limitHeader).toBeTruthy()

    const remainingHeader = res.headers.get('ratelimit-remaining')
    expect(remainingHeader).toBeTruthy()
  })

  it('/api returns 404 for undefined routes (not 5xx)', async () => {
    const res = await fetch(`${baseUrl}/api/test`)

    // No routes defined, but should get 404 not a server error
    expect(res.status).toBe(404)
  })

  /** Start the test server via tsx, return the port it listens on */
  function startServer(cwd: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server did not start within 15s'))
      }, 15000)

      serverProcess = spawn('npx', ['tsx', 'src/test-server.ts'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
      })

      let stderr = ''

      serverProcess.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim()
        try {
          const parsed = JSON.parse(line)
          if (typeof parsed.port === 'number') {
            clearTimeout(timeout)
            resolve(parsed.port)
          }
        } catch {
          // Not our JSON line, ignore
        }
      })

      serverProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      serverProcess.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== null && code !== 0) {
          reject(new Error(`Server exited with code ${code}:\n${stderr}`))
        }
      })

      serverProcess.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }
})
