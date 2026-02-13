import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient, databaseUrl } from './graphql-client.js'
import {
  cleanupFresh,
  type FreshBackend,
  prepareBackendFresh,
  regenBackend,
  runOrFail,
  type StartedServer,
  startServer,
  stopServer,
} from './prepare-backend.js'

// ---------------------------------------------------------------------------
// Helpers to build metadata field / catalog entries
// ---------------------------------------------------------------------------

function makeField(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'string',
    category: 'scalar',
    title: { en: overrides.name as string },
    required: false,
    requiredOnInput: false,
    updatable: true,
    updatableByUser: true,
    hidden: false,
    searchable: false,
    array: false,
    sharded: false,
    needFor: '',
    filters: ['equal'],
    showInList: true,
    showInCreate: true,
    showInEdit: true,
    showInFilter: true,
    showInShow: true,
    stringType: 'plain',
    ...overrides,
  }
}

const standardMethods = ['all', 'create', 'update', 'delete'].map((name) => ({
  name,
  methodType: name === 'all' ? 'query' : 'mutation',
  exportedToApi: true,
  async: false,
  queable: false,
  materialUiIcon: 'Brightness1Outlined',
  needFor: {},
  previewFeatures: [],
  title: { en: { singular: name } },
  argsModel: {
    name: `${name}Args`,
    fields: [],
    materialUiIcon: 'Brightness1Outlined',
    needFor: {},
    previewFeatures: [],
    title: { en: { singular: `${name}Args` } },
  },
  returnModel: { returnType: 'void' },
}))

function makeCatalog(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'catalog',
    titleField: 'name',
    keyField: 'id',
    singleKey: true,
    materialUiIcon: 'Brightness1Outlined',
    needFor: {},
    previewFeatures: [],
    auditable: false,
    deletable: true,
    editable: true,
    creatableByUser: true,
    updatableByUser: true,
    removableByUser: true,
    exportableByUser: false,
    searchEnabled: true,
    externalSearch: false,
    elasticOnly: false,
    isExternalSearch: false,
    sharded: false,
    multitenancy: 'none',
    commonElementsVisibleToAll: false,
    excludeFromCommonMenu: false,
    allowedToChange: '',
    sortField: 'id',
    sortOrder: 'DESC',
    uniqueConstraints: [],
    indexes: [],
    clearDBAfter: [],
    predefinedElements: [],
    devPerefinedElements: [],
    permissions: [],
    pages: [],
    generalModels: [],
    inputModels: [],
    outputModels: [],
    labels: [],
    forms: {
      list: { filter: { fields: [] } },
      show: { ignoredLinkedEntities: [] },
    },
    methods: standardMethods,
    ...overrides,
  }
}

function readMetadata(workDir: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(workDir, 'src/meta/metadata.json'), 'utf-8'),
  ) as Record<string, unknown>
}

function writeMetadata(workDir: string, metadata: Record<string, unknown>): void {
  fs.writeFileSync(path.join(workDir, 'src/meta/metadata.json'), JSON.stringify(metadata, null, 2))
}

// =========================================================================
// 1. Add a field to an existing entity (compile-only)
// =========================================================================

describe('e2e schema change: add field to existing entity', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    // Start with with-catalog (Product: id, title, price)
    fresh = await prepareBackendFresh('with-catalog')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  it('initial schema has Product with title and price', () => {
    const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toContain('model Product {')
    expect(schema).toContain('title')
    expect(schema).toContain('price')
    expect(schema).not.toContain('description')
  })

  it('initial typeDefs do not include description', () => {
    const typeDefs = fs.readFileSync(
      path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('title: String!')
    expect(typeDefs).not.toContain('description')
  })

  describe('after adding description field', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>
      const product = catalogs.find((c) => c.name === 'products') as Record<string, unknown>
      const fields = product.fields as Array<Record<string, unknown>>

      fields.push(
        makeField({
          name: 'description',
          type: 'string',
          category: 'scalar',
          required: false,
          requiredOnInput: false,
          searchable: true,
          stringType: 'plain',
        }),
      )

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds after adding field', () => {
      runOrFail('tsc', 'npx tsc --noEmit', {
        cwd: fresh.backDir,
        timeout: 30000,
      })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: {
          ...process.env,
          DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test',
        },
      })
    })

    it('Prisma schema now includes description field', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('model Product {')
      expect(schema).toMatch(/description\s+String\?/)
    })

    it('existing fields are preserved in Prisma schema', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('title')
      expect(schema).toContain('price')
    })

    it('GraphQL typeDefs now include description', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('description')
      // Optional field — no ! in the type
      expect(typeDefs).toContain('description: String')
    })

    it('existing GraphQL fields are preserved', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('title: String!')
      expect(typeDefs).toContain('price: Float!')
    })

    it('create mutation includes description argument', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      const createMatch = typeDefs.match(/createProduct\(([^)]+)\)/s)
      expect(createMatch).toBeTruthy()
      const createArgs = createMatch?.[1] ?? ''
      expect(createArgs).toContain('description')
    })
  })
})

// =========================================================================
// 2. Add a new entity (compile + API)
// =========================================================================

describe('e2e schema change: add new entity', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  it('initially only Product service exists', () => {
    const servicesDir = path.join(fresh.backDir, 'src/adm/graph/services')
    const dirs = fs.readdirSync(servicesDir)
    expect(dirs).toContain('products')
    expect(dirs).not.toContain('reviews')
  })

  describe('after adding Review entity', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>

      catalogs.push(
        makeCatalog({
          name: 'reviews',
          title: { en: { singular: 'Review', plural: 'Reviews' } },
          titleField: 'comment',
          fields: [
            makeField({
              name: 'id',
              type: 'string',
              category: 'id',
              autoGenerated: false,
              required: true,
              requiredOnInput: true,
            }),
            makeField({
              name: 'search',
              type: 'string',
              category: 'scalar',
              defaultBackendValueExpression: "''",
              defaultValueExpression: "''",
              hidden: true,
              updatableByUser: false,
            }),
            makeField({
              name: 'comment',
              type: 'string',
              category: 'scalar',
              required: true,
              requiredOnInput: true,
              searchable: true,
            }),
            makeField({
              name: 'rating',
              type: 'int',
              category: 'scalar',
              required: true,
              requiredOnInput: true,
              searchable: false,
              stringType: undefined,
              numberType: 'base',
              filters: ['equal', 'lte', 'gte'],
            }),
          ],
        }),
      )

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds after adding entity', () => {
      runOrFail('tsc', 'npx tsc --noEmit', {
        cwd: fresh.backDir,
        timeout: 30000,
      })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: {
          ...process.env,
          DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test',
        },
      })
    })

    it('Prisma schema includes Review model', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('model Review {')
      expect(schema).toMatch(/comment\s+String/)
      expect(schema).toMatch(/rating\s+Int/)
    })

    it('existing Product model is preserved', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('model Product {')
    })

    it('GraphQL service directory created for reviews', () => {
      const graphDir = path.join(fresh.backDir, 'src/adm/graph/services/reviews')
      expect(fs.existsSync(graphDir)).toBe(true)

      const files = fs.readdirSync(graphDir)
      expect(files).toContain('baseTypeDefs.ts')
      expect(files).toContain('baseResolvers.ts')
    })

    it('Review typeDefs define correct types', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/reviews/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('type Review {')
      expect(typeDefs).toContain('id: ID!')
      expect(typeDefs).toContain('comment: String!')
      expect(typeDefs).toContain('rating: Int!')
    })

    it('Review typeDefs have CRUD mutations', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/reviews/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('createReview(')
      expect(typeDefs).toContain('updateReview(')
      expect(typeDefs).toContain('removeReview(')
    })

    it('Review filter includes rating_lte and rating_gte', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/reviews/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('input ReviewFilter {')
      expect(typeDefs).toContain('rating_lte: Int')
      expect(typeDefs).toContain('rating_gte: Int')
    })

    it('Review service directory created', () => {
      const serviceDir = path.join(fresh.backDir, 'src/adm/services/ReviewsService')
      expect(fs.existsSync(serviceDir)).toBe(true)

      const files = fs.readdirSync(serviceDir)
      expect(files).toContain('ReviewsService.ts')
      expect(files).toContain('config.ts')
    })

    it('existing products GraphQL service is preserved', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('type Product {')
      expect(typeDefs).toContain('title: String!')
    })

    // --- API-level test: start server and verify the new entity works ---

    describe('API: new Review entity works via GraphQL', () => {
      let server: StartedServer
      let dbUrl: string

      interface Review {
        id: string
        comment: string
        rating: number
      }

      let reviews: CrudClient<Review>

      beforeAll(async () => {
        dbUrl = databaseUrl('test_schema_change')

        runOrFail('prisma db push', 'npx prisma db push --force-reset --accept-data-loss', {
          cwd: fresh.backDir,
          timeout: 30000,
          env: { ...process.env, DATABASE_MAIN_WRITE_URI: dbUrl },
        })

        server = await startServer(fresh.backDir, dbUrl)
        reviews = createCrudClient<Review>(server, 'Review', 'id comment rating')
      }, 60000)

      afterAll(async () => {
        await stopServer(server)
      })

      it('creates a review via GraphQL', async () => {
        const r = await reviews.create({
          id: 'rev-1',
          comment: 'Great product!',
          rating: 5,
        })
        expect(r.errors).toBeUndefined()
        expect(r.data?.createReview?.id).toBe('rev-1')
        expect(r.data?.createReview?.comment).toBe('Great product!')
        expect(r.data?.createReview?.rating).toBe(5)
      })

      it('reads the review by id', async () => {
        const r = await reviews.findOne('rev-1')
        expect(r.errors).toBeUndefined()
        expect(r.data?.Review?.comment).toBe('Great product!')
      })

      it('updates the review', async () => {
        const r = await reviews.update({
          id: 'rev-1',
          comment: 'Updated review',
          rating: 4,
        })
        expect(r.errors).toBeUndefined()
        expect(r.data?.updateReview?.comment).toBe('Updated review')
        expect(r.data?.updateReview?.rating).toBe(4)
      })

      it('filters reviews by rating', async () => {
        await reviews.create({ id: 'rev-2', comment: 'OK', rating: 3 })
        await reviews.create({ id: 'rev-3', comment: 'Bad', rating: 1 })

        const r = await reviews.findAll({
          filter: { rating_gte: 3 },
        })
        expect(r.errors).toBeUndefined()
        const comments = r.data?.allReviews?.map((rv: Review) => rv.comment) ?? []
        expect(comments).toContain('Updated review')
        expect(comments).toContain('OK')
        expect(comments).not.toContain('Bad')
      })

      it('removes the review', async () => {
        const r = await reviews.remove('rev-1')
        expect(r.errors).toBeUndefined()

        const check = await reviews.findOne('rev-1')
        expect(check.data?.Review).toBeNull()
      })
    })
  })
})
