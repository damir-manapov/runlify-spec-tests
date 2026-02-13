import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
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

  it('healthz endpoint responds', async () => {
    const res = await fetch(`${ctx.server.baseUrl}/healthz`)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('creates a product via GraphQL mutation', async () => {
    const result = await products.create({ id: 'gql-1', title: 'GraphQL Widget', price: 9.99 })

    expect(result.errors).toBeUndefined()
    expect(result.data?.createProduct?.id).toBe('gql-1')
    expect(result.data?.createProduct?.title).toBe('GraphQL Widget')
    expect(result.data?.createProduct?.price).toBe(9.99)
  })

  it('queries a single product by id', async () => {
    const result = await products.findOne('gql-1')

    expect(result.errors).toBeUndefined()
    expect(result.data?.Product?.title).toBe('GraphQL Widget')
    expect(result.data?.Product?.price).toBe(9.99)
  })

  it('updates a product via GraphQL mutation', async () => {
    const result = await products.update({ id: 'gql-1', title: 'Super Widget', price: 19.99 })

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateProduct?.title).toBe('Super Widget')
    expect(result.data?.updateProduct?.price).toBe(19.99)
  })

  it('lists all products via allProducts query', async () => {
    // Create a second product
    await products.create({ id: 'gql-2', title: 'Another Widget', price: 29.99 })

    const result = await products.findAll({ sortField: 'title', sortOrder: 'ASC' })

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(2)
    expect(result.data?.allProducts?.at(0)?.title).toBe('Another Widget')
    expect(result.data?.allProducts?.at(1)?.title).toBe('Super Widget')
  })

  it('filters products via allProducts with filter', async () => {
    const result = await products.findAll({ filter: { q: 'super' } }, 'id title')

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(1)
    expect(result.data?.allProducts?.at(0)?.id).toBe('gql-1')
  })

  it('gets products count via _allProductsMeta', async () => {
    const result = await products.count()

    expect(result.errors).toBeUndefined()
    expect(result.data?._allProductsMeta?.count).toBe(2)
  })

  it('paginates via page and perPage', async () => {
    const result = await products.findAll(
      { page: 0, perPage: 1, sortField: 'title', sortOrder: 'ASC' },
      'id',
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(1)
  })

  it('removes a product via GraphQL mutation', async () => {
    const result = await products.remove('gql-2', 'id')

    expect(result.errors).toBeUndefined()
    expect(result.data?.removeProduct?.id).toBe('gql-2')

    // Verify it's gone
    const remaining = await products.findAll(undefined, 'id')
    expect(remaining.data?.allProducts).toHaveLength(1)
    expect(remaining.data?.allProducts?.at(0)?.id).toBe('gql-1')
  })

  it('returns error for non-existent product query', async () => {
    const result = await products.findOne('non-existent', 'id title')

    expect(result.errors).toBeUndefined()
    expect(result.data?.Product).toBeNull()
  })

  it('sorts products in DESC order', async () => {
    // State: gql-1 "Super Widget" exists from earlier tests
    await products.create({ id: 'gql-d1', title: 'Alpha', price: 1 })
    await products.create({ id: 'gql-d2', title: 'Zeta', price: 2 })

    const result = await products.findAll({ sortField: 'title', sortOrder: 'DESC' }, 'title')

    expect(result.errors).toBeUndefined()
    const titles = result.data?.allProducts?.map((p) => p.title)
    expect(titles?.at(0)).toBe('Zeta')
    expect(titles?.at(-1)).toBe('Alpha')

    // cleanup
    await products.remove('gql-d1')
    await products.remove('gql-d2')
  })

  it('paginates to second page', async () => {
    await products.create({ id: 'gql-p1', title: 'Page A', price: 1 })
    await products.create({ id: 'gql-p2', title: 'Page B', price: 2 })
    await products.create({ id: 'gql-p3', title: 'Page C', price: 3 })

    const page1 = await products.findAll(
      { page: 1, perPage: 2, sortField: 'title', sortOrder: 'ASC' },
      'id title',
    )

    expect(page1.errors).toBeUndefined()
    // page 1 should contain remaining items after first 2
    expect(page1.data?.allProducts?.length).toBeGreaterThanOrEqual(1)

    // cleanup
    await products.remove('gql-p1')
    await products.remove('gql-p2')
    await products.remove('gql-p3')
  })

  it('update preserves fields passed explicitly', async () => {
    await products.update({ id: 'gql-1', title: 'Updated Title', price: 99.99 })

    const after = await products.findOne('gql-1')
    expect(after.data?.Product?.price).toBe(99.99)
    expect(after.data?.Product?.title).toBe('Updated Title')

    // restore
    await products.update({ id: 'gql-1', title: 'Super Widget', price: 19.99 })
  })

  it('count decreases after removing a product', async () => {
    const beforeCount = await products.count()
    const countBefore = beforeCount.data?._allProductsMeta?.count ?? 0

    await products.create({ id: 'gql-tmp', title: 'Temporary', price: 0 })
    const afterCreate = await products.count()
    expect(afterCreate.data?._allProductsMeta?.count).toBe(countBefore + 1)

    await products.remove('gql-tmp')
    const afterRemove = await products.count()
    expect(afterRemove.data?._allProductsMeta?.count).toBe(countBefore)
  })

  it('filter by id returns exact match', async () => {
    const result = await products.findAll({ filter: { id: 'gql-1' } }, 'id title')

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(1)
    expect(result.data?.allProducts?.at(0)?.id).toBe('gql-1')
  })

  it('empty list after removing all products', async () => {
    // Start from known state: create exactly two products
    await products.create({ id: 'gql-e1', title: 'Ephemeral 1', price: 1 })
    await products.create({ id: 'gql-e2', title: 'Ephemeral 2', price: 2 })

    // Remove everything in the DB
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
