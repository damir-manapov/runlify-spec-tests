import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupPrepared,
  type PreparedBackend,
  prepareBackend,
  type StartedServer,
  startServer,
  stopServer,
} from './prepare-backend.js'

describe('e2e: generated backend runs', () => {
  let prepared: PreparedBackend
  let server: StartedServer

  beforeAll(async () => {
    prepared = await prepareBackend()
    server = await startServer(prepared.backDir)
  }, 180000)

  afterAll(async () => {
    await stopServer(server)
    cleanupPrepared(prepared)
  })

  it('server starts and /healthz returns ok', async () => {
    const res = await fetch(`${server.baseUrl}/healthz`)

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('unknown routes return 404', async () => {
    const res = await fetch(`${server.baseUrl}/nonexistent`)

    expect(res.status).toBe(404)
  })

  it('/api routes have rate limit headers', async () => {
    const res = await fetch(`${server.baseUrl}/api/anything`)

    // express-rate-limit sets RateLimit-* headers (standardHeaders: true)
    const limitHeader = res.headers.get('ratelimit-limit')
    expect(limitHeader).toBeTruthy()

    const remainingHeader = res.headers.get('ratelimit-remaining')
    expect(remainingHeader).toBeTruthy()
  })

  it('/api returns 404 for undefined routes (not 5xx)', async () => {
    const res = await fetch(`${server.baseUrl}/api/test`)

    // No routes defined, but should get 404 not a server error
    expect(res.status).toBe(404)
  })
})
