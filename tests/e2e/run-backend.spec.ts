import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

describe('e2e: generated backend runs', () => {
  let ctx: SetupServerResult

  beforeAll(async () => {
    ctx = await setupServer('with-catalog', 'test_run_backend')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  it('server starts and /healthz returns ok', async () => {
    const res = await fetch(`${ctx.server.baseUrl}/healthz`)

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('unknown routes return 404', async () => {
    const res = await fetch(`${ctx.server.baseUrl}/nonexistent`)

    expect(res.status).toBe(404)
  })

  it('/api routes have rate limit headers', async () => {
    const res = await fetch(`${ctx.server.baseUrl}/api/anything`)

    // express-rate-limit sets RateLimit-* headers (standardHeaders: true)
    const limitHeader = res.headers.get('ratelimit-limit')
    expect(limitHeader).toBeTruthy()

    const remainingHeader = res.headers.get('ratelimit-remaining')
    expect(remainingHeader).toBeTruthy()
  })

  it('/api returns 404 for undefined routes (not 5xx)', async () => {
    const res = await fetch(`${ctx.server.baseUrl}/api/test`)

    // No routes defined, but should get 404 not a server error
    expect(res.status).toBe(404)
  })
})
