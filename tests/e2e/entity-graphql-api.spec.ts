import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient, DATABASE_URL } from './graphql-client.js'
import {
  cleanupPrepared,
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  type StartedServer,
  startServer,
  stopServer,
} from './prepare-backend.js'

interface Product {
  id: string
  title: string
  price: number
}

describe('e2e: GraphQL API for catalog entity', () => {
  let prepared: PreparedBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    prepared = await prepareBackend('with-catalog')

    // Push Prisma schema to the real DB (reset to clean state)
    runOrFail('prisma db push', 'npx prisma db push --force-reset --accept-data-loss', {
      cwd: prepared.backDir,
      timeout: 30000,
      env: { ...process.env, DATABASE_MAIN_WRITE_URI: DATABASE_URL },
    })

    server = await startServer(prepared.backDir, DATABASE_URL)
    products = createCrudClient<Product>(server, 'Product', 'id title price')
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupPrepared(prepared)
  })

  it('healthz endpoint responds', async () => {
    const res = await fetch(`${server.baseUrl}/healthz`)
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
})
