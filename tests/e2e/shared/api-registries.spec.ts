/**
 * Shared e2e: registry entities — info registry + sum registry.
 *
 * Tests CRUD, date filtering, region filtering, amount range filtering,
 * and unique constraints for registry entity types.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getBackend } from '../backend-under-test.js'
import { type CrudClient, createCrudClient } from '../graphql-client.js'
import type { StartedServer } from '../prepare-backend.js'

const backend = getBackend()

// ---------------------------------------------------------------------------
// 1. Info registry — periodic (day)  (with-info-registry / Price)
// ---------------------------------------------------------------------------

interface Price {
  id: string
  date: string
  region: string
  amount: number
}

describe(`shared e2e [${backend.name}]: infoRegistry (with-info-registry)`, () => {
  let server: StartedServer
  let prices: CrudClient<Price>

  beforeAll(async () => {
    server = await backend.start('with-info-registry', `shared_ireg_${backend.name}`)
    prices = createCrudClient<Price>(server, 'Price', 'id date region amount')
  }, 240_000)

  afterAll(async () => {
    await backend.stop(server)
  })

  async function createOk(data: Record<string, unknown>): Promise<Price> {
    const r = await prices.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createPrice as Price
  }

  async function removeQuiet(id: string): Promise<void> {
    await prices.remove(id)
  }

  describe('basic CRUD', () => {
    it('creates a price entry', async () => {
      const p = await createOk({ id: 'p-1', date: '2025-01-15', region: 'US', amount: 99.5 })
      expect(p.id).toBe('p-1')
      expect(p.region).toBe('US')
      expect(p.amount).toBe(99.5)
    })

    it('reads price by id', async () => {
      const r = await prices.findOne('p-1')
      expect(r.errors).toBeUndefined()
      expect(r.data?.Price?.region).toBe('US')
    })

    it('updates price amount', async () => {
      const r = await prices.update({ id: 'p-1', date: '2025-01-15', region: 'US', amount: 149.99 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updatePrice?.amount).toBe(149.99)
    })

    it('removes price entry', async () => {
      const r = await prices.remove('p-1')
      expect(r.errors).toBeUndefined()
      const check = await prices.findOne('p-1')
      expect(check.data?.Price).toBeNull()
    })
  })

  describe('dimensions form unique constraint', () => {
    it('creates two prices with different regions', async () => {
      await createOk({ id: 'p-2', date: '2025-02-01', region: 'US', amount: 100 })
      await createOk({ id: 'p-3', date: '2025-02-01', region: 'EU', amount: 120 })

      const r = await prices.findAll()
      expect(r.errors).toBeUndefined()
      expect(r.data?.allPrices?.length).toBeGreaterThanOrEqual(2)

      await removeQuiet('p-2')
      await removeQuiet('p-3')
    })
  })

  describe('filters', () => {
    it('filters by region', async () => {
      await createOk({ id: 'f-1', date: '2025-03-01', region: 'US', amount: 50 })
      await createOk({ id: 'f-2', date: '2025-03-01', region: 'EU', amount: 75 })

      const r = await prices.findAll({ filter: { region: 'EU' } })
      expect(r.errors).toBeUndefined()
      expect(r.data?.allPrices?.every((p: Price) => p.region === 'EU')).toBe(true)

      await removeQuiet('f-1')
      await removeQuiet('f-2')
    })

    it('filters by amount range', async () => {
      await createOk({ id: 'r-1', date: '2025-04-01', region: 'UK', amount: 10 })
      await createOk({ id: 'r-2', date: '2025-04-01', region: 'JP', amount: 200 })

      const r = await prices.findAll({ filter: { amount_gte: 100 } })
      expect(r.errors).toBeUndefined()
      expect(r.data?.allPrices?.every((p: Price) => p.amount >= 100)).toBe(true)

      await removeQuiet('r-1')
      await removeQuiet('r-2')
    })
  })

  describe('count', () => {
    it('returns correct count', async () => {
      await createOk({ id: 'c-1', date: '2025-05-01', region: 'CA', amount: 30 })
      await createOk({ id: 'c-2', date: '2025-05-01', region: 'MX', amount: 40 })

      const r = await prices.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allPricesMeta?.count).toBeGreaterThanOrEqual(2)

      await removeQuiet('c-1')
      await removeQuiet('c-2')
    })
  })

  describe('date field filtering', () => {
    it('filters by date_gte', async () => {
      await createOk({ id: 'df-1', date: '2025-01-01', region: 'X1', amount: 10 })
      await createOk({ id: 'df-2', date: '2025-06-01', region: 'X2', amount: 20 })
      await createOk({ id: 'df-3', date: '2025-12-01', region: 'X3', amount: 30 })

      const r = await prices.findAll({ filter: { date_gte: '2025-05-01' } })
      expect(r.errors).toBeUndefined()
      const ids = r.data?.allPrices?.map((p: Price) => p.id) ?? []
      expect(ids).toContain('df-2')
      expect(ids).toContain('df-3')
      expect(ids).not.toContain('df-1')

      await removeQuiet('df-1')
      await removeQuiet('df-2')
      await removeQuiet('df-3')
    })

    it('filters by date_lte', async () => {
      await createOk({ id: 'dl-1', date: '2025-01-01', region: 'Y1', amount: 10 })
      await createOk({ id: 'dl-2', date: '2025-06-01', region: 'Y2', amount: 20 })
      await createOk({ id: 'dl-3', date: '2025-12-01', region: 'Y3', amount: 30 })

      const r = await prices.findAll({ filter: { date_lte: '2025-07-01' } })
      expect(r.errors).toBeUndefined()
      const ids = r.data?.allPrices?.map((p: Price) => p.id) ?? []
      expect(ids).toContain('dl-1')
      expect(ids).toContain('dl-2')
      expect(ids).not.toContain('dl-3')

      await removeQuiet('dl-1')
      await removeQuiet('dl-2')
      await removeQuiet('dl-3')
    })

    it('filters by date range (gte + lte combined)', async () => {
      await createOk({ id: 'dr-1', date: '2025-01-01', region: 'Z1', amount: 10 })
      await createOk({ id: 'dr-2', date: '2025-06-01', region: 'Z2', amount: 20 })
      await createOk({ id: 'dr-3', date: '2025-12-01', region: 'Z3', amount: 30 })

      const r = await prices.findAll({ filter: { date_gte: '2025-03-01', date_lte: '2025-09-01' } })
      expect(r.errors).toBeUndefined()
      const ids = r.data?.allPrices?.map((p: Price) => p.id) ?? []
      expect(ids).toContain('dr-2')
      expect(ids).not.toContain('dr-1')
      expect(ids).not.toContain('dr-3')

      await removeQuiet('dr-1')
      await removeQuiet('dr-2')
      await removeQuiet('dr-3')
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Sum registry  (with-sum-registry / Total)
// ---------------------------------------------------------------------------

interface Total {
  id: string
  region: string
  amount: number
}

describe(`shared e2e [${backend.name}]: sumRegistry (with-sum-registry)`, () => {
  let server: StartedServer
  let totals: CrudClient<Total>

  beforeAll(async () => {
    server = await backend.start('with-sum-registry', `shared_sreg_${backend.name}`)
    totals = createCrudClient<Total>(server, 'Total', 'id region amount')
  }, 240_000)

  afterAll(async () => {
    await backend.stop(server)
  })

  async function createOk(data: Record<string, unknown>): Promise<Total> {
    const r = await totals.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createTotal as Total
  }

  async function removeQuiet(id: string): Promise<void> {
    await totals.remove(id)
  }

  describe('basic CRUD', () => {
    it('creates a total entry', async () => {
      const t = await createOk({ id: 't-1', region: 'US', amount: 1000 })
      expect(t.id).toBe('t-1')
      expect(t.region).toBe('US')
      expect(t.amount).toBe(1000)
    })

    it('reads total by id', async () => {
      const r = await totals.findOne('t-1')
      expect(r.errors).toBeUndefined()
      expect(r.data?.Total?.region).toBe('US')
      expect(r.data?.Total?.amount).toBe(1000)
    })

    it('updates total amount', async () => {
      const r = await totals.update({ id: 't-1', region: 'US', amount: 2500 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateTotal?.amount).toBe(2500)
    })

    it('removes total entry', async () => {
      const r = await totals.remove('t-1')
      expect(r.errors).toBeUndefined()
      const check = await totals.findOne('t-1')
      expect(check.data?.Total).toBeNull()
    })
  })

  describe('findAll and count', () => {
    it('lists all totals', async () => {
      await createOk({ id: 't-2', region: 'EU', amount: 500 })
      await createOk({ id: 't-3', region: 'APAC', amount: 750 })

      const r = await totals.findAll()
      expect(r.errors).toBeUndefined()
      expect(r.data?.allTotals?.length).toBeGreaterThanOrEqual(2)

      await removeQuiet('t-2')
      await removeQuiet('t-3')
    })

    it('counts totals', async () => {
      await createOk({ id: 't-4', region: 'LATAM', amount: 300 })

      const r = await totals.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allTotalsMeta?.count).toBeGreaterThanOrEqual(1)

      await removeQuiet('t-4')
    })
  })

  describe('filters', () => {
    it('filters by region', async () => {
      await createOk({ id: 'sf-1', region: 'US', amount: 100 })
      await createOk({ id: 'sf-2', region: 'EU', amount: 200 })

      const r = await totals.findAll({ filter: { region: 'US' } })
      expect(r.errors).toBeUndefined()
      expect(r.data?.allTotals?.every((t: Total) => t.region === 'US')).toBe(true)

      await removeQuiet('sf-1')
      await removeQuiet('sf-2')
    })
  })
})
