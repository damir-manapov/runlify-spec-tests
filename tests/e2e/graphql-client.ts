import type { StartedServer } from './prepare-backend.js'

const DATABASE_BASE_URL = 'postgresql://test:test@localhost:5432/test'

/** Get a database URL scoped to a specific Postgres schema (for parallel isolation) */
export function databaseUrl(schema: string): string {
  return `${DATABASE_BASE_URL}?schema=${schema}`
}

export interface GqlResponse<T = Record<string, unknown>> {
  data?: T
  errors?: Array<{ message: string }>
}

/** Send a GraphQL request to the running server */
export async function gql<T = Record<string, unknown>>(
  server: StartedServer,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GqlResponse<T>> {
  const res = await fetch(`${server.baseUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  return res.json() as Promise<GqlResponse<T>>
}

// ---------------------------------------------------------------------------
// Generic CRUD client for runlify-generated GraphQL entities
// ---------------------------------------------------------------------------

/** Serialize a JS value to a GraphQL inline literal */
function toGqlLiteral(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(toGqlLiteral).join(', ')}]`
  // object → { key: val, … }
  const entries = Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${k}: ${toGqlLiteral(val)}`)
    .join(', ')
  return `{ ${entries} }`
}

/** Build a parenthesized args string like `(id: "x", title: "y", price: 9.99)` */
function buildArgs(args: object | undefined): string {
  if (!args || Object.keys(args).length === 0) return ''
  const parts = Object.entries(args).map(([k, v]) => `${k}: ${toGqlLiteral(v)}`)
  return `(${parts.join(', ')})`
}

export interface FindAllOptions {
  sortField?: string
  sortOrder?: 'ASC' | 'DESC'
  page?: number
  perPage?: number
  filter?: Record<string, unknown>
}

export interface CrudClient<T> {
  create(data: Record<string, unknown>, fields?: string): Promise<GqlResponse<{ [k: string]: T }>>
  findOne(id: string, fields?: string): Promise<GqlResponse<{ [k: string]: T | null }>>
  findAll(opts?: FindAllOptions, fields?: string): Promise<GqlResponse<{ [k: string]: T[] }>>
  update(data: Record<string, unknown>, fields?: string): Promise<GqlResponse<{ [k: string]: T }>>
  remove(id: string, fields?: string): Promise<GqlResponse<{ [k: string]: T }>>
  count(): Promise<GqlResponse<{ [k: string]: { count: number } }>>
}

/**
 * Create a typed CRUD client for a runlify-generated entity.
 *
 * @example
 * ```ts
 * const products = createCrudClient<Product>(server, 'Product', 'id title price')
 * await products.create({ id: '1', title: 'Widget', price: 9.99 })
 * await products.findOne('1')
 * await products.findAll({ sortField: 'title', sortOrder: 'ASC' })
 * await products.update({ id: '1', price: 19.99 })
 * await products.remove('1')
 * await products.count()
 * ```
 */
export function createCrudClient<T>(
  server: StartedServer,
  entity: string,
  defaultFields: string,
): CrudClient<T> {
  return {
    create(data, fields = defaultFields) {
      return gql(server, `mutation { create${entity}${buildArgs(data)} { ${fields} } }`)
    },

    findOne(id, fields = defaultFields) {
      return gql(server, `query { ${entity}(id: ${toGqlLiteral(id)}) { ${fields} } }`)
    },

    findAll(opts, fields = defaultFields) {
      return gql(server, `query { all${entity}s${buildArgs(opts)} { ${fields} } }`)
    },

    update(data, fields = defaultFields) {
      return gql(server, `mutation { update${entity}${buildArgs(data)} { ${fields} } }`)
    },

    remove(id, fields = defaultFields) {
      return gql(server, `mutation { remove${entity}(id: ${toGqlLiteral(id)}) { ${fields} } }`)
    },

    count() {
      return gql(server, `query { _all${entity}sMeta { count } }`)
    },
  }
}
