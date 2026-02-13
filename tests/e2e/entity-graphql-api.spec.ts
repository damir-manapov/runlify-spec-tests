import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupPrepared,
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  type StartedServer,
  startServer,
  stopServer,
} from './prepare-backend.js'

const DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

/** Send a GraphQL request to the running server */
async function gql<T = Record<string, unknown>>(
  server: StartedServer,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  const res = await fetch(`${server.baseUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  return res.json() as Promise<{ data?: T; errors?: Array<{ message: string }> }>
}

describe('e2e: GraphQL API for catalog entity', () => {
  let prepared: PreparedBackend
  let server: StartedServer

  beforeAll(async () => {
    prepared = await prepareBackend('with-catalog')

    // Push Prisma schema to the real DB (reset to clean state)
    runOrFail('prisma db push', 'npx prisma db push --force-reset --accept-data-loss', {
      cwd: prepared.backDir,
      timeout: 30000,
      env: { ...process.env, DATABASE_MAIN_WRITE_URI: DATABASE_URL },
    })

    server = await startServer(prepared.backDir, DATABASE_URL)
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
    const result = await gql<{ createProduct: { id: string; title: string; price: number } }>(
      server,
      `mutation {
        createProduct(id: "gql-1", title: "GraphQL Widget", price: 9.99) {
          id
          title
          price
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.createProduct.id).toBe('gql-1')
    expect(result.data?.createProduct.title).toBe('GraphQL Widget')
    expect(result.data?.createProduct.price).toBe(9.99)
  })

  it('queries a single product by id', async () => {
    const result = await gql<{ Product: { id: string; title: string; price: number } | null }>(
      server,
      `query {
        Product(id: "gql-1") {
          id
          title
          price
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.Product?.title).toBe('GraphQL Widget')
    expect(result.data?.Product?.price).toBe(9.99)
  })

  it('updates a product via GraphQL mutation', async () => {
    const result = await gql<{
      updateProduct: { id: string; title: string; price: number }
    }>(
      server,
      `mutation {
        updateProduct(id: "gql-1", title: "Super Widget", price: 19.99) {
          id
          title
          price
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateProduct.title).toBe('Super Widget')
    expect(result.data?.updateProduct.price).toBe(19.99)
  })

  it('lists all products via allProducts query', async () => {
    // Create a second product
    await gql(
      server,
      `mutation {
        createProduct(id: "gql-2", title: "Another Widget", price: 29.99) { id }
      }`,
    )

    const result = await gql<{
      allProducts: Array<{ id: string; title: string; price: number }>
    }>(
      server,
      `query {
        allProducts(sortField: "title", sortOrder: "ASC") {
          id
          title
          price
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(2)
    expect(result.data?.allProducts?.at(0)?.title).toBe('Another Widget')
    expect(result.data?.allProducts?.at(1)?.title).toBe('Super Widget')
  })

  it('filters products via allProducts with filter', async () => {
    const result = await gql<{
      allProducts: Array<{ id: string; title: string }>
    }>(
      server,
      `query {
        allProducts(filter: { q: "super" }) {
          id
          title
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(1)
    expect(result.data?.allProducts?.at(0)?.id).toBe('gql-1')
  })

  it('gets products count via _allProductsMeta', async () => {
    const result = await gql<{ _allProductsMeta: { count: number } }>(
      server,
      `query {
        _allProductsMeta {
          count
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?._allProductsMeta?.count).toBe(2)
  })

  it('paginates via page and perPage', async () => {
    const result = await gql<{
      allProducts: Array<{ id: string }>
    }>(
      server,
      `query {
        allProducts(page: 0, perPage: 1, sortField: "title", sortOrder: "ASC") {
          id
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.allProducts).toHaveLength(1)
  })

  it('removes a product via GraphQL mutation', async () => {
    const result = await gql<{ removeProduct: { id: string } }>(
      server,
      `mutation {
        removeProduct(id: "gql-2") {
          id
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.removeProduct?.id).toBe('gql-2')

    // Verify it's gone
    const remaining = await gql<{ allProducts: Array<{ id: string }> }>(
      server,
      `query { allProducts { id } }`,
    )
    expect(remaining.data?.allProducts).toHaveLength(1)
    expect(remaining.data?.allProducts?.at(0)?.id).toBe('gql-1')
  })

  it('returns error for non-existent product query', async () => {
    const result = await gql<{ Product: null }>(
      server,
      `query {
        Product(id: "non-existent") {
          id
          title
        }
      }`,
    )

    expect(result.errors).toBeUndefined()
    expect(result.data?.Product).toBeNull()
  })
})
