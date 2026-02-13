import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

interface Counter {
  id: string // BigInt is serialized as string over GraphQL
  label: string
}

describe('e2e: GraphQL API for auto-generated bigint id entity', () => {
  let ctx: SetupServerResult
  let counters: CrudClient<Counter>

  beforeAll(async () => {
    ctx = await setupServer('with-bigint-id', 'test_bigint_api')
    counters = createCrudClient<Counter>(ctx.server, 'Counter', 'id label')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createOk(data: Record<string, unknown>): Promise<Counter> {
    const r = await counters.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createCounter as Counter
  }

  async function removeQuiet(id: string): Promise<void> {
    await counters.remove(id)
  }

  // ---------------------------------------------------------------------------
  // 1. Auto-generated BigInt ID
  // ---------------------------------------------------------------------------

  describe('auto-generated bigint id', () => {
    it('creates counter without providing id — server assigns one', async () => {
      const counter = await createOk({ label: 'First' })

      // BigInt comes back as string in GraphQL
      expect(counter.id).toBeTruthy()
      expect(counter.label).toBe('First')

      await removeQuiet(counter.id)
    })

    it('creates two counters — ids are distinct', async () => {
      const a = await createOk({ label: 'A' })
      const b = await createOk({ label: 'B' })

      expect(a.id).not.toBe(b.id)

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('reads counter by bigint id', async () => {
      const created = await createOk({ label: 'ReadMe' })

      const r = await counters.findOne(created.id)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Counter?.label).toBe('ReadMe')

      await removeQuiet(created.id)
    })

    it('updates counter by bigint id', async () => {
      const created = await createOk({ label: 'Old' })

      const r = await counters.update({ id: created.id, label: 'New' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateCounter?.label).toBe('New')

      await removeQuiet(created.id)
    })

    it('removes counter by bigint id', async () => {
      const created = await createOk({ label: 'Gone' })

      const r = await counters.remove(created.id)
      expect(r.errors).toBeUndefined()

      const check = await counters.findOne(created.id)
      expect(check.data?.Counter).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. BigInt serialization
  // ---------------------------------------------------------------------------

  describe('bigint serialization', () => {
    it('id is returned as string (BigInt scalar)', async () => {
      const counter = await createOk({ label: 'TypeCheck' })

      // GraphQL BigInt scalar serializes as string
      expect(typeof counter.id).toBe('string')
      // Should be a numeric string
      expect(Number(counter.id)).toBeGreaterThan(0)

      await removeQuiet(counter.id)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. findAll, sorting, count
  // ---------------------------------------------------------------------------

  describe('findAll and sorting', () => {
    it('lists all counters', async () => {
      const a = await createOk({ label: 'Alpha' })
      const b = await createOk({ label: 'Beta' })

      const r = await counters.findAll()
      expect(r.errors).toBeUndefined()
      const labels = r.data?.allCounters?.map((c: Counter) => c.label) ?? []
      expect(labels).toContain('Alpha')
      expect(labels).toContain('Beta')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('counts counters', async () => {
      const a = await createOk({ label: 'C1' })
      const b = await createOk({ label: 'C2' })

      const r = await counters.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allCountersMeta?.count).toBeGreaterThanOrEqual(2)

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })
})
