import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

interface Item {
  id: number
  name: string
  quantity: number
  active: boolean
  description: string | null
  createdAt: string | null
}

describe('e2e: GraphQL API for auto-generated int id entity', () => {
  let ctx: SetupServerResult
  let items: CrudClient<Item>

  beforeAll(async () => {
    ctx = await setupServer('with-auto-id', 'test_auto_id_api')
    items = createCrudClient<Item>(
      ctx.server,
      'Item',
      'id name quantity active description createdAt',
    )
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createOk(data: Record<string, unknown>): Promise<Item> {
    const r = await items.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createItem as Item
  }

  async function removeQuiet(id: number): Promise<void> {
    await items.remove(id)
  }

  // ---------------------------------------------------------------------------
  // 1. Auto-generated ID
  // ---------------------------------------------------------------------------

  describe('auto-generated int id', () => {
    it('creates item without providing id — server assigns one', async () => {
      const item = await createOk({ name: 'Widget', quantity: 10, active: true })

      expect(item.id).toBeTypeOf('number')
      expect(item.id).toBeGreaterThan(0)
      expect(item.name).toBe('Widget')

      await removeQuiet(item.id)
    })

    it('creates two items — ids are distinct', async () => {
      const a = await createOk({ name: 'A', quantity: 1, active: true })
      const b = await createOk({ name: 'B', quantity: 2, active: true })

      expect(a.id).not.toBe(b.id)

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('reads item by integer id', async () => {
      const created = await createOk({ name: 'ReadMe', quantity: 5, active: false })

      const r = await items.findOne(created.id)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Item?.name).toBe('ReadMe')
      expect(r.data?.Item?.quantity).toBe(5)

      await removeQuiet(created.id)
    })

    it('updates item by integer id', async () => {
      const created = await createOk({ name: 'Old', quantity: 1, active: true })

      const r = await items.update({ id: created.id, name: 'New', quantity: 99, active: true })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.name).toBe('New')
      expect(r.data?.updateItem?.quantity).toBe(99)

      await removeQuiet(created.id)
    })

    it('removes item by integer id', async () => {
      const created = await createOk({ name: 'Gone', quantity: 0, active: false })

      const r = await items.remove(created.id)
      expect(r.errors).toBeUndefined()

      const check = await items.findOne(created.id)
      expect(check.data?.Item).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Boolean field
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // 3. Optional fields
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // 4. Integer field filtering
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // 5. Datetime field filtering
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // 6. Sorting with int id
  // ---------------------------------------------------------------------------

  describe('sorting', () => {
    it('sorts by quantity ASC', async () => {
      const a = await createOk({ name: 'Z', quantity: 30, active: true })
      const b = await createOk({ name: 'A', quantity: 10, active: true })
      const c = await createOk({ name: 'M', quantity: 20, active: true })

      const r = await items.findAll({ sortField: 'quantity', sortOrder: 'ASC' })
      expect(r.errors).toBeUndefined()
      const quantities = r.data?.allItems?.map((i: Item) => i.quantity) ?? []
      expect(quantities).toEqual([...quantities].sort((a, b) => a - b))

      await removeQuiet(a.id)
      await removeQuiet(b.id)
      await removeQuiet(c.id)
    })
  })
})
