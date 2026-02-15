/**
 * Shared e2e: auto-generated int id — extended coverage.
 *
 * Covers boolean fields, optional fields, datetime/int filtering,
 * _defined filter, ids bulk filter — areas not tested by crud-basic.spec.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getBackend } from '../backend-under-test.js'
import { type CrudClient, createCrudClient } from '../graphql-client.js'
import type { StartedServer } from '../prepare-backend.js'

interface Item {
  id: number
  name: string
  quantity: number
  active: boolean
  description: string | null
  createdAt: string | null
}

const backend = getBackend()
const FIELDS = 'id name quantity active description createdAt'

describe(`shared e2e [${backend.name}]: auto-generated int id (with-auto-id)`, () => {
  let server: StartedServer
  let items: CrudClient<Item>

  beforeAll(async () => {
    server = await backend.start('with-auto-id', `shared_auto_id_${backend.name}`)
    items = createCrudClient<Item>(server, 'Item', FIELDS)
  }, 240_000)

  afterAll(async () => {
    await backend.stop(server)
  })

  async function createOk(data: Record<string, unknown>): Promise<Item> {
    const r = await items.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createItem as Item
  }

  async function removeQuiet(id: number): Promise<void> {
    await items.remove(id)
  }

  // -----------------------------------------------------------------------
  // Auto-generated int id
  // -----------------------------------------------------------------------

  describe('auto-generated int id', () => {
    it('creates item without providing id — server assigns one', async () => {
      const item = await createOk({ name: 'Widget', quantity: 10, active: true })
      expect(item.id).toBeTypeOf('number')
      expect(item.id).toBeGreaterThan(0)
      await removeQuiet(item.id)
    })

    it('creates two items — ids are distinct', async () => {
      const a = await createOk({ name: 'A', quantity: 1, active: true })
      const b = await createOk({ name: 'B', quantity: 2, active: true })
      expect(a.id).not.toBe(b.id)
      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })

  // -----------------------------------------------------------------------
  // Boolean field
  // -----------------------------------------------------------------------

  describe('boolean field', () => {
    it('stores true and retrieves it', async () => {
      const item = await createOk({ name: 'BoolTrue', quantity: 1, active: true })
      expect(item.active).toBe(true)
      await removeQuiet(item.id)
    })

    it('stores false and retrieves it', async () => {
      const item = await createOk({ name: 'BoolFalse', quantity: 1, active: false })
      expect(item.active).toBe(false)
      await removeQuiet(item.id)
    })

    it('updates boolean from true to false', async () => {
      const item = await createOk({ name: 'Flip', quantity: 1, active: true })
      const r = await items.update({ id: item.id, name: 'Flip', quantity: 1, active: false })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.active).toBe(false)
      await removeQuiet(item.id)
    })
  })

  // -----------------------------------------------------------------------
  // Optional fields
  // -----------------------------------------------------------------------

  describe('optional fields', () => {
    it('creates item with optional fields null by default', async () => {
      const item = await createOk({ name: 'Minimal', quantity: 1, active: true })
      expect(item.description).toBeNull()
      expect(item.createdAt).toBeNull()
      await removeQuiet(item.id)
    })

    it('creates item with optional fields provided', async () => {
      const now = new Date().toISOString()
      const item = await createOk({
        name: 'Full',
        quantity: 1,
        active: true,
        description: 'A fine item',
        createdAt: now,
      })
      expect(item.description).toBe('A fine item')
      expect(item.createdAt).toBeTruthy()
      await removeQuiet(item.id)
    })

    it('updates optional field from null to value', async () => {
      const item = await createOk({ name: 'Upgrade', quantity: 1, active: true })
      const r = await items.update({
        id: item.id,
        name: 'Upgrade',
        quantity: 1,
        active: true,
        description: 'Now described',
      })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.description).toBe('Now described')
      await removeQuiet(item.id)
    })

    it('updates optional field from value to null', async () => {
      const item = await createOk({
        name: 'Downgrade',
        quantity: 1,
        active: true,
        description: 'Has desc',
      })
      const r = await items.update({
        id: item.id,
        name: 'Downgrade',
        quantity: 1,
        active: true,
        description: null,
      })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.description).toBeNull()
      await removeQuiet(item.id)
    })
  })

  // -----------------------------------------------------------------------
  // Integer field filtering
  // -----------------------------------------------------------------------

  describe('integer field filtering', () => {
    it('filters quantity by lte and gte', async () => {
      const a = await createOk({ name: 'Low', quantity: 5, active: true })
      const b = await createOk({ name: 'Mid', quantity: 50, active: true })
      const c = await createOk({ name: 'High', quantity: 500, active: true })

      const r = await items.findAll({ filter: { quantity_gte: 10, quantity_lte: 100 } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name)
      expect(names).toContain('Mid')
      expect(names).not.toContain('Low')
      expect(names).not.toContain('High')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
      await removeQuiet(c.id)
    })
  })

  // -----------------------------------------------------------------------
  // Datetime field filtering
  // -----------------------------------------------------------------------

  describe('datetime field filtering', () => {
    it('filters createdAt by gte', async () => {
      const past = '2020-01-01T00:00:00.000Z'
      const future = '2099-12-31T23:59:59.000Z'
      const a = await createOk({ name: 'Old', quantity: 1, active: true, createdAt: past })
      const b = await createOk({ name: 'Future', quantity: 1, active: true, createdAt: future })

      const r = await items.findAll({ filter: { createdAt_gte: '2050-01-01T00:00:00.000Z' } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name)
      expect(names).toContain('Future')
      expect(names).not.toContain('Old')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })

  // -----------------------------------------------------------------------
  // Ids bulk filter
  // -----------------------------------------------------------------------

  describe('ids bulk filter', () => {
    it('filters by list of ids', async () => {
      const a = await createOk({ name: 'Bulk-A', quantity: 1, active: true })
      const b = await createOk({ name: 'Bulk-B', quantity: 2, active: true })
      const c = await createOk({ name: 'Bulk-C', quantity: 3, active: true })

      const r = await items.findAll({ filter: { ids: [a.id, c.id] } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name) ?? []
      expect(names).toContain('Bulk-A')
      expect(names).toContain('Bulk-C')
      expect(names).not.toContain('Bulk-B')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
      await removeQuiet(c.id)
    })
  })

  // -----------------------------------------------------------------------
  // _defined filter
  // -----------------------------------------------------------------------

  describe('_defined filter', () => {
    it('filters items with null description', async () => {
      const a = await createOk({ name: 'HasDesc', quantity: 1, active: true, description: 'yes' })
      const b = await createOk({ name: 'NoDesc', quantity: 1, active: true })

      const r = await items.findAll({ filter: { description_defined: false } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name) ?? []
      expect(names).toContain('NoDesc')
      expect(names).not.toContain('HasDesc')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('filters items with non-null description', async () => {
      const a = await createOk({
        name: 'WithDesc',
        quantity: 1,
        active: true,
        description: 'present',
      })
      const b = await createOk({ name: 'Without', quantity: 1, active: true })

      const r = await items.findAll({ filter: { description_defined: true } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name) ?? []
      expect(names).toContain('WithDesc')
      expect(names).not.toContain('Without')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })

  // -----------------------------------------------------------------------
  // Full-text search by description
  // -----------------------------------------------------------------------

  describe('full-text search includes description', () => {
    it('finds items by description substring', async () => {
      const a = await createOk({
        name: 'QDesc-A',
        quantity: 1,
        active: true,
        description: 'unique-token-xyz',
      })
      const b = await createOk({
        name: 'QDesc-B',
        quantity: 1,
        active: true,
        description: 'something else',
      })

      const r = await items.findAll({ filter: { q: 'unique-token' } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name) ?? []
      expect(names).toContain('QDesc-A')
      expect(names).not.toContain('QDesc-B')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })
})
