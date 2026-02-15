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

/** Extract the first array value from a GqlResponse.data (avoids non-null assertions). */
export function extractList<T>(data: Record<string, unknown> | undefined): T[] {
  if (!data) return []
  return Object.values(data)[0] as T[]
}

// ---------------------------------------------------------------------------
// Generic CRUD client for runlify-generated GraphQL entities
// ---------------------------------------------------------------------------

/** Serialize a JS value to a GraphQL inline literal */
function toGqlLiteral(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'bigint') return String(v)
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
  findOne(id: string | number, fields?: string): Promise<GqlResponse<{ [k: string]: T | null }>>
  findAll(opts?: FindAllOptions, fields?: string): Promise<GqlResponse<{ [k: string]: T[] }>>
  update(data: Record<string, unknown>, fields?: string): Promise<GqlResponse<{ [k: string]: T }>>
  remove(id: string | number, fields?: string): Promise<GqlResponse<{ [k: string]: T }>>
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
  /** Override the plural form used in allXxx / _allXxxMeta queries (default: entity + 's') */
  plural?: string,
): CrudClient<T> {
  const p = plural ?? `${entity}s`
  return {
    create(data, fields = defaultFields) {
      return gql(server, `mutation { create${entity}${buildArgs(data)} { ${fields} } }`)
    },

    findOne(id, fields = defaultFields) {
      return gql(server, `query { ${entity}(id: ${toGqlLiteral(id)}) { ${fields} } }`)
    },

    findAll(opts, fields = defaultFields) {
      return gql(server, `query { all${p}${buildArgs(opts)} { ${fields} } }`)
    },

    update(data, fields = defaultFields) {
      return gql(server, `mutation { update${entity}${buildArgs(data)} { ${fields} } }`)
    },

    remove(id, fields = defaultFields) {
      return gql(server, `mutation { remove${entity}(id: ${toGqlLiteral(id)}) { ${fields} } }`)
    },

    count() {
      return gql(server, `query { _all${p}Meta { count } }`)
    },
  }
}

// ---------------------------------------------------------------------------
// Periodic info-registry client (adds sliceOfTheLast / sliceOfTheFirst)
// ---------------------------------------------------------------------------

export interface PeriodicClient<T> extends CrudClient<T> {
  sliceOfTheLast(
    args?: Record<string, unknown>,
    fields?: string,
  ): Promise<GqlResponse<{ [k: string]: T | null }>>
  sliceOfTheFirst(
    args?: Record<string, unknown>,
    fields?: string,
  ): Promise<GqlResponse<{ [k: string]: T | null }>>
}

/**
 * Create a CRUD client extended with `sliceOfTheLast` / `sliceOfTheFirst`
 * queries — for periodic info registries.
 *
 * @example
 * ```ts
 * const prices = createPeriodicCrudClient<Price>(server, 'Price', 'id date region amount')
 * await prices.sliceOfTheLast({ date: '2025-03-01', region: 'US' })
 * await prices.sliceOfTheFirst({ date: '2025-01-01' })
 * ```
 */
export function createPeriodicCrudClient<T>(
  server: StartedServer,
  entity: string,
  defaultFields: string,
  plural?: string,
): PeriodicClient<T> {
  const base = createCrudClient<T>(server, entity, defaultFields, plural)
  return {
    ...base,
    sliceOfTheLast(args, fields = defaultFields) {
      return gql(server, `query { sliceOfTheLast${entity}${buildArgs(args)} { ${fields} } }`)
    },
    sliceOfTheFirst(args, fields = defaultFields) {
      return gql(server, `query { sliceOfTheFirst${entity}${buildArgs(args)} { ${fields} } }`)
    },
  }
}
