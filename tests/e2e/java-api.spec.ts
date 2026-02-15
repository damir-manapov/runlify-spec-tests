import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient, gql } from './graphql-client.js'
import type { StartedServer } from './prepare-backend.js'
import { startJavaServer, stopJavaServer } from './prepare-java-backend.js'

// ---------------------------------------------------------------------------
// Entity shapes
// ---------------------------------------------------------------------------

interface Item {
  id: number
  name: string
  quantity: number
  active: boolean
  description: string | null
  search: string | null
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('e2e: Java backend — GraphQL API for catalog (with-auto-id)', () => {
  let server: StartedServer
  let items: CrudClient<Item>

  beforeAll(async () => {
    server = await startJavaServer('with-auto-id', 'java_auto_id')
    items = createCrudClient<Item>(server, 'Item', 'id name quantity active description')
  }, 120000)

  afterAll(async () => {
    await stopJavaServer(server)
  })

  // -----------------------------------------------------------------------
  // 1. Basic CRUD
  // -----------------------------------------------------------------------

  describe('basic CRUD', () => {
    it('creates an item (auto-increment id)', async () => {
      const r = await items.create({ name: 'Widget', quantity: 10, active: true })

      expect(r.errors).toBeUndefined()
      expect(r.data?.createItem).toBeDefined()
      expect(r.data?.createItem?.name).toBe('Widget')
      expect(r.data?.createItem?.quantity).toBe(10)
      expect(r.data?.createItem?.active).toBe(true)
      // auto-generated id should be a positive integer
      expect(r.data?.createItem?.id).toBeGreaterThan(0)
    })

    it('reads an item by id', async () => {
      // create fresh
      const c = await items.create({ name: 'Gizmo', quantity: 5, active: false })
      const id = c.data?.createItem?.id

      const r = await items.findOne(id as number)

      expect(r.errors).toBeUndefined()
      expect(r.data?.Item?.name).toBe('Gizmo')
      expect(r.data?.Item?.quantity).toBe(5)
      expect(r.data?.Item?.active).toBe(false)
    })

    it('updates an item', async () => {
      const c = await items.create({ name: 'Alpha', quantity: 1, active: true })
      const id = c.data?.createItem?.id as number

      const r = await items.update({ id, name: 'Beta', quantity: 99 })

      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.name).toBe('Beta')
      expect(r.data?.updateItem?.quantity).toBe(99)
      expect(r.data?.updateItem?.active).toBe(true) // unchanged
    })

    it('removes an item', async () => {
      const c = await items.create({ name: 'ToDelete', quantity: 0, active: true })
      const id = c.data?.createItem?.id as number

      const r = await items.remove(id)

      expect(r.errors).toBeUndefined()
      expect(r.data?.removeItem?.id).toBe(id)
      expect(r.data?.removeItem?.name).toBe('ToDelete')

      // confirm it's gone
      const check = await items.findOne(id)
      expect(check.data?.Item).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // 2. List & pagination
  // -----------------------------------------------------------------------

  describe('list and pagination', () => {
    beforeAll(async () => {
      // seed some data
      for (const name of ['C-third', 'A-first', 'B-second']) {
        await items.create({ name, quantity: 1, active: true })
      }
    })

    it('lists items sorted by name ASC', async () => {
      const r = await items.findAll({ sortField: 'name', sortOrder: 'ASC' })

      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i) => i.name) ?? []
      expect(names).toEqual([...names].sort())
    })

    it('paginates with page + perPage', async () => {
      const r = await items.findAll({ page: 0, perPage: 2, sortField: 'id', sortOrder: 'ASC' })

      expect(r.errors).toBeUndefined()
      expect(r.data?.allItems?.length).toBeLessThanOrEqual(2)
    })

    it('counts items', async () => {
      const r = await items.count()

      expect(r.errors).toBeUndefined()
      expect(r.data?._allItemsMeta?.count).toBeGreaterThanOrEqual(3)
    })
  })

  // -----------------------------------------------------------------------
  // 3. Filters
  // -----------------------------------------------------------------------

  describe('filters', () => {
    it('filters by name (equal)', async () => {
      await items.create({ name: 'UniqueFilter', quantity: 42, active: true })

      const r = await items.findAll({ filter: { name: 'UniqueFilter' } })

      expect(r.errors).toBeUndefined()
      expect(r.data?.allItems).toHaveLength(1)
      expect(r.data?.allItems?.at(0)?.name).toBe('UniqueFilter')
    })

    it('filters with q (full-text ILIKE on search column)', async () => {
      await items.create({ name: 'SearchMe', quantity: 1, active: true })

      const r = await items.findAll({ filter: { q: 'searchme' } })

      expect(r.errors).toBeUndefined()
      expect(r.data?.allItems?.length ?? 0).toBeGreaterThanOrEqual(1)
      const found = r.data?.allItems?.some((i) => i.name === 'SearchMe')
      expect(found).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // 4. Introspection sanity check
  // -----------------------------------------------------------------------

  describe('schema introspection', () => {
    it('exposes expected query fields', async () => {
      const r = await gql<{ __schema: { queryType: { fields: { name: string }[] } } }>(
        server,
        '{ __schema { queryType { fields { name } } } }',
      )

      const names = r.data?.__schema.queryType.fields.map((f) => f.name) ?? []
      expect(names).toContain('Item')
      expect(names).toContain('allItems')
      expect(names).toContain('_allItemsMeta')
    })

    it('exposes expected mutation fields', async () => {
      const r = await gql<{ __schema: { mutationType: { fields: { name: string }[] } } }>(
        server,
        '{ __schema { mutationType { fields { name } } } }',
      )

      const names = r.data?.__schema.mutationType.fields.map((f) => f.name) ?? []
      expect(names).toContain('createItem')
      expect(names).toContain('updateItem')
      expect(names).toContain('removeItem')
    })
  })
})
