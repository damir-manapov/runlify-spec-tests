import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient, gql } from './graphql-client.js'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

interface Product {
  id: string
  title: string
  price: number
}

describe('e2e: GraphQL API for catalog entity', () => {
  let ctx: SetupServerResult
  let products: CrudClient<Product>

  beforeAll(async () => {
    ctx = await setupServer('with-catalog', 'test_graphql_api')
    products = createCrudClient<Product>(ctx.server, 'Product', 'id title price')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Create a product, asserting no errors */
  async function createOk(data: Record<string, unknown>): Promise<void> {
    const r = await products.create(data)
    expect(r.errors).toBeUndefined()
  }

  /** Remove a product by id, swallowing errors (cleanup) */
  async function removeQuiet(id: string): Promise<void> {
    await products.remove(id)
  }

  /** Remove multiple products by id */
  async function removeAll(...ids: string[]): Promise<void> {
    for (const id of ids) await removeQuiet(id)
  }

  // ---------------------------------------------------------------------------
  // 1. Basic CRUD — the happy path
  // ---------------------------------------------------------------------------

  describe('basic CRUD', () => {
    it('creates a product', async () => {
      const result = await products.create({ id: 'gql-1', title: 'GraphQL Widget', price: 9.99 })

      expect(result.errors).toBeUndefined()
      expect(result.data?.createProduct?.id).toBe('gql-1')
      expect(result.data?.createProduct?.title).toBe('GraphQL Widget')
      expect(result.data?.createProduct?.price).toBe(9.99)
    })

    it('reads a product by id', async () => {
      const result = await products.findOne('gql-1')

      expect(result.errors).toBeUndefined()
      expect(result.data?.Product?.title).toBe('GraphQL Widget')
      expect(result.data?.Product?.price).toBe(9.99)
    })

    it('updates a product', async () => {
      const result = await products.update({
        id: 'gql-1',
        title: 'Super Widget',
        price: 19.99,
      })

      expect(result.errors).toBeUndefined()
      expect(result.data?.updateProduct?.title).toBe('Super Widget')
      expect(result.data?.updateProduct?.price).toBe(19.99)
    })

    it('lists all products (sorted ASC)', async () => {
      await createOk({ id: 'gql-2', title: 'Another Widget', price: 29.99 })

      const result = await products.findAll({ sortField: 'title', sortOrder: 'ASC' })

      expect(result.errors).toBeUndefined()
      expect(result.data?.allProducts).toHaveLength(2)
      expect(result.data?.allProducts?.at(0)?.title).toBe('Another Widget')
      expect(result.data?.allProducts?.at(1)?.title).toBe('Super Widget')
    })

    it('counts products', async () => {
      const result = await products.count()

      expect(result.errors).toBeUndefined()
      expect(result.data?._allProductsMeta?.count).toBe(2)
    })

    it('removes a product', async () => {
      const result = await products.remove('gql-2', 'id')

      expect(result.errors).toBeUndefined()
      expect(result.data?.removeProduct?.id).toBe('gql-2')

      const remaining = await products.findAll(undefined, 'id')
      expect(remaining.data?.allProducts).toHaveLength(1)
    })

    it('returns null for non-existent product', async () => {
      const result = await products.findOne('non-existent', 'id title')

      expect(result.errors).toBeUndefined()
      expect(result.data?.Product).toBeNull()
    })

    // Cleanup: leave gql-1 as "Super Widget" @ 19.99
  })

  // ---------------------------------------------------------------------------
  // 2. Sorting
  // ---------------------------------------------------------------------------

  describe('sorting', () => {
    beforeAll(async () => {
      await createOk({ id: 'sort-1', title: 'Alpha', price: 30 })
      await createOk({ id: 'sort-2', title: 'Zeta', price: 10 })
      await createOk({ id: 'sort-3', title: 'Mid', price: 20 })
    })

    afterAll(() => removeAll('sort-1', 'sort-2', 'sort-3'))

    it('sorts by title ASC', async () => {
      const r = await products.findAll({ sortField: 'title', sortOrder: 'ASC' }, 'title')
      const titles = r.data?.allProducts?.map((p) => p.title) ?? []
      expect(titles.indexOf('Alpha')).toBeLessThan(titles.indexOf('Mid'))
      expect(titles.indexOf('Mid')).toBeLessThan(titles.indexOf('Zeta'))
    })

    it('sorts by title DESC', async () => {
      const r = await products.findAll({ sortField: 'title', sortOrder: 'DESC' }, 'title')
      const titles = r.data?.allProducts?.map((p) => p.title) ?? []
      expect(titles.indexOf('Zeta')).toBeLessThan(titles.indexOf('Mid'))
      expect(titles.indexOf('Mid')).toBeLessThan(titles.indexOf('Alpha'))
    })

    it('sorts by price ASC', async () => {
      const r = await products.findAll({ sortField: 'price', sortOrder: 'ASC' }, 'price')
      const prices = r.data?.allProducts?.map((p) => p.price) ?? []
      // prices among sort-* products: 10, 20, 30
      const sorted = [...prices].sort((a, b) => a - b)
      expect(prices).toEqual(sorted)
    })

    it('sorts by price DESC', async () => {
      const r = await products.findAll({ sortField: 'price', sortOrder: 'DESC' }, 'price')
      const prices = r.data?.allProducts?.map((p) => p.price) ?? []
      const sorted = [...prices].sort((a, b) => b - a)
      expect(prices).toEqual(sorted)
    })

    it('sorts by id', async () => {
      const r = await products.findAll({ sortField: 'id', sortOrder: 'ASC' }, 'id')
      const ids = r.data?.allProducts?.map((p) => p.id) ?? []
      const sorted = [...ids].sort()
      expect(ids).toEqual(sorted)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Filtering
  // ---------------------------------------------------------------------------

  describe('filtering', () => {
    beforeAll(async () => {
      await createOk({ id: 'flt-1', title: 'Expensive Watch', price: 500 })
      await createOk({ id: 'flt-2', title: 'Cheap Watch', price: 20 })
      await createOk({ id: 'flt-3', title: 'Mid Phone', price: 100 })
    })

    afterAll(() => removeAll('flt-1', 'flt-2', 'flt-3'))

    it('filters by q (full-text search)', async () => {
      const r = await products.findAll({ filter: { q: 'watch' } }, 'id')
      const ids = r.data?.allProducts?.map((p) => p.id) ?? []
      expect(ids).toContain('flt-1')
      expect(ids).toContain('flt-2')
      expect(ids).not.toContain('flt-3')
    })

    it('q filter is case-insensitive', async () => {
      const r = await products.findAll({ filter: { q: 'WATCH' } }, 'id')
      const ids = r.data?.allProducts?.map((p) => p.id) ?? []
      expect(ids).toContain('flt-1')
      expect(ids).toContain('flt-2')
    })

    it('q filter with empty string returns all', async () => {
      const all = await products.findAll(undefined, 'id')
      const filtered = await products.findAll({ filter: { q: '' } }, 'id')
      expect(filtered.data?.allProducts?.length).toBe(all.data?.allProducts?.length)
    })

    it('filters by exact id', async () => {
      const r = await products.findAll({ filter: { id: 'flt-2' } }, 'id title')

      expect(r.data?.allProducts).toHaveLength(1)
      expect(r.data?.allProducts?.at(0)?.id).toBe('flt-2')
    })

    it('filter with no matches returns empty array', async () => {
      const r = await products.findAll({ filter: { q: 'xyznonexistent' } }, 'id')
      expect(r.data?.allProducts).toHaveLength(0)
    })

    it('filters by price_lte', async () => {
      const r = await products.findAll({ filter: { price_lte: 100 } }, 'id price')
      const prices = r.data?.allProducts?.map((p) => p.price) ?? []
      for (const p of prices) expect(p).toBeLessThanOrEqual(100)
      expect(r.data?.allProducts?.map((p) => p.id)).toContain('flt-2')
      expect(r.data?.allProducts?.map((p) => p.id)).toContain('flt-3')
    })

    it('filters by price_gte', async () => {
      const r = await products.findAll({ filter: { price_gte: 100 } }, 'id price')
      const prices = r.data?.allProducts?.map((p) => p.price) ?? []
      for (const p of prices) expect(p).toBeGreaterThanOrEqual(100)
      expect(r.data?.allProducts?.map((p) => p.id)).toContain('flt-1')
      expect(r.data?.allProducts?.map((p) => p.id)).toContain('flt-3')
    })

    it('combines price_gte and price_lte for range query', async () => {
      const r = await products.findAll({ filter: { price_gte: 50, price_lte: 200 } }, 'id')
      expect(r.data?.allProducts).toHaveLength(1)
      expect(r.data?.allProducts?.at(0)?.id).toBe('flt-3')
    })

    it('count with filter', async () => {
      const r = await gql<{ _allProductsMeta: { count: number } }>(
        ctx.server,
        `query { _allProductsMeta(filter: { q: "watch" }) { count } }`,
      )
      expect(r.errors).toBeUndefined()
      expect(r.data?._allProductsMeta?.count).toBe(2)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Pagination
  // ---------------------------------------------------------------------------

  describe('pagination', () => {
    const pgIds = ['pg-1', 'pg-2', 'pg-3', 'pg-4', 'pg-5']

    beforeAll(async () => {
      for (let i = 0; i < pgIds.length; i++) {
        await createOk({ id: pgIds[i], title: `Page Item ${i + 1}`, price: i + 1 })
      }
    })

    afterAll(() => removeAll(...pgIds))

    it('perPage limits result count', async () => {
      const r = await products.findAll(
        { page: 0, perPage: 2, sortField: 'id', sortOrder: 'ASC', filter: { q: 'page item' } },
        'id',
      )
      expect(r.data?.allProducts).toHaveLength(2)
    })

    it('page 0 and page 1 return different items', async () => {
      const opts = {
        perPage: 2,
        sortField: 'id',
        sortOrder: 'ASC' as const,
        filter: { q: 'page item' },
      }

      const p0 = await products.findAll({ ...opts, page: 0 }, 'id')
      const p1 = await products.findAll({ ...opts, page: 1 }, 'id')

      const ids0 = p0.data?.allProducts?.map((p) => p.id) ?? []
      const ids1 = p1.data?.allProducts?.map((p) => p.id) ?? []
      // No overlap
      for (const id of ids0) expect(ids1).not.toContain(id)
    })

    it('page beyond total returns empty array', async () => {
      const r = await products.findAll(
        { page: 100, perPage: 10, sortField: 'id', sortOrder: 'ASC', filter: { q: 'page item' } },
        'id',
      )
      expect(r.data?.allProducts).toHaveLength(0)
    })

    it('meta count reflects total (not page count)', async () => {
      const list = await products.findAll(
        { page: 0, perPage: 2, sortField: 'id', sortOrder: 'ASC', filter: { q: 'page item' } },
        'id',
      )
      const meta = await gql<{ _allProductsMeta: { count: number } }>(
        ctx.server,
        `query { _allProductsMeta(filter: { q: "page item" }) { count } }`,
      )

      expect(list.data?.allProducts).toHaveLength(2)
      expect(meta.data?._allProductsMeta?.count).toBe(5)
    })

    it('perPage larger than total returns all', async () => {
      const r = await products.findAll(
        { page: 0, perPage: 1000, sortField: 'id', sortOrder: 'ASC', filter: { q: 'page item' } },
        'id',
      )
      expect(r.data?.allProducts?.length).toBe(5)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Input edge cases — boundary values
  // ---------------------------------------------------------------------------

  describe('input edge cases', () => {
    it('creates product with price 0', async () => {
      const r = await products.create({ id: 'edge-zero', title: 'Free', price: 0 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.price).toBe(0)

      const read = await products.findOne('edge-zero')
      expect(read.data?.Product?.price).toBe(0)
      await removeQuiet('edge-zero')
    })

    it('creates product with negative price', async () => {
      const r = await products.create({ id: 'edge-neg', title: 'Rebate', price: -5.5 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.price).toBe(-5.5)
      await removeQuiet('edge-neg')
    })

    it('creates product with very large price', async () => {
      const r = await products.create({ id: 'edge-big', title: 'Luxury', price: 999999999.99 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.price).toBe(999999999.99)
      await removeQuiet('edge-big')
    })

    it('creates product with unicode title', async () => {
      const title = '日本語テスト 🎉 émojis'
      const r = await products.create({ id: 'edge-unicode', title, price: 1 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.title).toBe(title)

      const read = await products.findOne('edge-unicode')
      expect(read.data?.Product?.title).toBe(title)
      await removeQuiet('edge-unicode')
    })

    it('creates product with special characters in title', async () => {
      const title = `He said "hello" & it's <fine> \\ slash`
      const r = await products.create({ id: 'edge-special', title, price: 1 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.title).toBe(title)
      await removeQuiet('edge-special')
    })

    it('creates product with very long title', async () => {
      const title = 'A'.repeat(5000)
      const r = await products.create({ id: 'edge-long', title, price: 1 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.title).toBe(title)
      await removeQuiet('edge-long')
    })

    it('handles floating-point precision', async () => {
      // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754
      const r = await products.create({ id: 'edge-fp', title: 'Float', price: 0.1 })
      expect(r.errors).toBeUndefined()

      const read = await products.findOne('edge-fp')
      expect(read.data?.Product?.price).toBeCloseTo(0.1)
      await removeQuiet('edge-fp')
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Mutation error cases
  // ---------------------------------------------------------------------------

  describe('mutation errors', () => {
    it('duplicate id on create returns error', async () => {
      await createOk({ id: 'dup-1', title: 'First', price: 1 })
      const r = await products.create({ id: 'dup-1', title: 'Second', price: 2 })

      expect(r.errors).toBeDefined()
      expect(r.errors?.length).toBeGreaterThan(0)
      await removeQuiet('dup-1')
    })

    it('update non-existent product returns error', async () => {
      const r = await products.update({ id: 'ghost', title: 'Nope', price: 0 })
      expect(r.errors).toBeDefined()
    })

    it('remove non-existent product returns error', async () => {
      const r = await products.remove('ghost')
      expect(r.errors).toBeDefined()
    })

    it('double remove returns error on second call', async () => {
      await createOk({ id: 'dbl-rm', title: 'Doomed', price: 1 })
      const r1 = await products.remove('dbl-rm')
      expect(r1.errors).toBeUndefined()

      const r2 = await products.remove('dbl-rm')
      expect(r2.errors).toBeDefined()
    })

    it('create without required field title returns error', async () => {
      const r = await gql<unknown>(
        ctx.server,
        `mutation { createProduct(id: "no-title", price: 1) { id } }`,
      )
      expect(r.errors).toBeDefined()
    })

    it('create without required field price returns error', async () => {
      const r = await gql<unknown>(
        ctx.server,
        `mutation { createProduct(id: "no-price", title: "X") { id } }`,
      )
      expect(r.errors).toBeDefined()
    })

    it('create without id returns error', async () => {
      const r = await gql<unknown>(
        ctx.server,
        `mutation { createProduct(title: "No ID", price: 1) { id } }`,
      )
      expect(r.errors).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Update semantics
  // ---------------------------------------------------------------------------

  describe('update semantics', () => {
    beforeAll(() => createOk({ id: 'upd-1', title: 'Original', price: 10 }))
    afterAll(() => removeQuiet('upd-1'))

    it('update changes only specified fields (all required)', async () => {
      const r = await products.update({ id: 'upd-1', title: 'Changed', price: 10 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateProduct?.title).toBe('Changed')
      expect(r.data?.updateProduct?.price).toBe(10)
    })

    it('read-back after update is consistent', async () => {
      await products.update({ id: 'upd-1', title: 'V2', price: 20 })
      const read = await products.findOne('upd-1')
      expect(read.data?.Product?.title).toBe('V2')
      expect(read.data?.Product?.price).toBe(20)
    })

    it('re-create after delete reuses the same id', async () => {
      await createOk({ id: 'reuse-1', title: 'First Life', price: 1 })
      await products.remove('reuse-1')

      const r = await products.create({ id: 'reuse-1', title: 'Second Life', price: 2 })
      expect(r.errors).toBeUndefined()
      expect(r.data?.createProduct?.title).toBe('Second Life')

      const read = await products.findOne('reuse-1')
      expect(read.data?.Product?.title).toBe('Second Life')
      await removeQuiet('reuse-1')
    })
  })

  // ---------------------------------------------------------------------------
  // 8. GraphQL protocol edge cases
  // ---------------------------------------------------------------------------

  describe('GraphQL protocol', () => {
    it('malformed GraphQL returns errors', async () => {
      const r = await gql<unknown>(ctx.server, '{ this is not valid graphql !!!}')
      expect(r.errors).toBeDefined()
    })

    it('empty query body returns error status', async () => {
      const res = await fetch(`${ctx.server.baseUrl}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      // Apollo returns 400 with a plain-text or JSON error for missing query
      expect(res.ok).toBe(false)
    })

    it('introspection query returns schema', async () => {
      const r = await gql<{ __schema: { types: Array<{ name: string }> } }>(
        ctx.server,
        '{ __schema { types { name } } }',
      )
      expect(r.errors).toBeUndefined()
      const typeNames = r.data?.__schema?.types?.map((t) => t.name) ?? []
      expect(typeNames).toContain('Product')
      expect(typeNames).toContain('Query')
      expect(typeNames).toContain('Mutation')
    })

    it('introspection lists Product fields', async () => {
      const r = await gql<{
        __type: { fields: Array<{ name: string; type: { name: string | null; kind: string } }> }
      }>(ctx.server, '{ __type(name: "Product") { fields { name type { name kind } } } }')

      expect(r.errors).toBeUndefined()
      const fieldNames = r.data?.__type?.fields?.map((f) => f.name) ?? []
      expect(fieldNames).toContain('id')
      expect(fieldNames).toContain('title')
      expect(fieldNames).toContain('price')
    })

    it('requesting unknown field returns error', async () => {
      const r = await gql<unknown>(ctx.server, '{ Product(id: "gql-1") { id nonExistentField } }')
      expect(r.errors).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Count tracks mutations
  // ---------------------------------------------------------------------------

  describe('count tracks mutations', () => {
    it('count increases after create', async () => {
      const before = await products.count()
      const countBefore = before.data?._allProductsMeta?.count ?? 0

      await createOk({ id: 'cnt-1', title: 'Counter', price: 1 })

      const after = await products.count()
      expect(after.data?._allProductsMeta?.count).toBe(countBefore + 1)
      await removeQuiet('cnt-1')
    })

    it('count decreases after remove', async () => {
      await createOk({ id: 'cnt-2', title: 'Counter 2', price: 1 })
      const before = await products.count()
      const countBefore = before.data?._allProductsMeta?.count ?? 0

      await products.remove('cnt-2')

      const after = await products.count()
      expect(after.data?._allProductsMeta?.count).toBe(countBefore - 1)
    })
  })

  // ---------------------------------------------------------------------------
  // 10. Empty state
  // ---------------------------------------------------------------------------

  describe('empty state', () => {
    it('removing all products leads to empty list and zero count', async () => {
      // Create known products
      await createOk({ id: 'empty-1', title: 'E1', price: 1 })
      await createOk({ id: 'empty-2', title: 'E2', price: 2 })

      // Remove everything
      const all = await products.findAll(undefined, 'id')
      for (const p of all.data?.allProducts ?? []) {
        await products.remove(p.id)
      }

      const result = await products.findAll(undefined, 'id')
      expect(result.errors).toBeUndefined()
      expect(result.data?.allProducts).toHaveLength(0)

      const count = await products.count()
      expect(count.data?._allProductsMeta?.count).toBe(0)
    })
  })
})
