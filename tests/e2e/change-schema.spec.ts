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

// =========================================================================
// 3. Remove a field from an existing entity
// =========================================================================

describe('e2e schema change: remove field from entity', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  it('initial schema has price field', () => {
    const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toMatch(/price\s+Float/)
  })

  describe('after removing price field', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>
      const product = catalogs.find((c) => c.name === 'products') as Record<string, unknown>
      const fields = product.fields as Array<Record<string, unknown>>
      product.fields = fields.filter((f) => f.name !== 'price')

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds', () => {
      runOrFail('tsc', 'npx tsc --noEmit', { cwd: fresh.backDir, timeout: 30000 })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    })

    it('Prisma schema no longer contains price', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('model Product {')
      expect(schema).not.toMatch(/price\s+Float/)
    })

    it('other fields are preserved', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('title')
      expect(schema).toMatch(/id\s+String/)
    })

    it('GraphQL typeDefs no longer contain price', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).not.toContain('price')
      expect(typeDefs).toContain('title: String!')
    })

    it('create mutation no longer has price argument', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      const createMatch = typeDefs.match(/createProduct\(([^)]+)\)/s)
      expect(createMatch).toBeTruthy()
      expect(createMatch?.[1]).not.toContain('price')
    })
  })
})

// =========================================================================
// 4. Remove an entire entity
// =========================================================================

describe('e2e schema change: remove entity', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    // with-relations has Category + Article
    fresh = await prepareBackendFresh('with-relations')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  it('initial schema has both Category and Article models', () => {
    const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toContain('model Category {')
    expect(schema).toContain('model Article {')
  })

  it('initial services include both entities', () => {
    const servicesDir = path.join(fresh.backDir, 'src/adm/graph/services')
    const dirs = fs.readdirSync(servicesDir)
    expect(dirs).toContain('categories')
    expect(dirs).toContain('articles')
  })

  describe('after removing Article entity', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>
      metadata.catalogs = catalogs.filter((c) => c.name !== 'articles')

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds', () => {
      runOrFail('tsc', 'npx tsc --noEmit', { cwd: fresh.backDir, timeout: 30000 })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    })

    it('Prisma schema no longer contains Article model', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).not.toContain('model Article {')
    })

    it('Category model is preserved', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('model Category {')
    })

    it('articles GraphQL service directory is removed', () => {
      const graphDir = path.join(fresh.backDir, 'src/adm/graph/services/articles')
      expect(fs.existsSync(graphDir)).toBe(false)
    })

    it('categories GraphQL service is preserved', () => {
      const graphDir = path.join(fresh.backDir, 'src/adm/graph/services/categories')
      expect(fs.existsSync(graphDir)).toBe(true)
    })

    it('ArticlesService directory is removed', () => {
      const serviceDir = path.join(fresh.backDir, 'src/adm/services/ArticlesService')
      expect(fs.existsSync(serviceDir)).toBe(false)
    })

    it('CategoriesService is preserved', () => {
      const serviceDir = path.join(fresh.backDir, 'src/adm/services/CategoriesService')
      expect(fs.existsSync(serviceDir)).toBe(true)
    })

    it('BaseServices no longer references articles', () => {
      const baseServices = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/services/BaseServices.ts'),
        'utf-8',
      )
      expect(baseServices).not.toContain('articles:')
      expect(baseServices).toContain('categories:')
    })

    it('serviceConstrictors no longer references articles', () => {
      const constructors = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/services/serviceConstrictors.ts'),
        'utf-8',
      )
      expect(constructors).not.toContain('articles:')
      expect(constructors).toContain('categories:')
    })
  })
})

// =========================================================================
// 5. Change field type (float → int)
// =========================================================================

describe('e2e schema change: change field type', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  it('initial price field is Float', () => {
    const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
    expect(schema).toMatch(/price\s+Float/)
  })

  it('initial GraphQL price is Float!', () => {
    const typeDefs = fs.readFileSync(
      path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('price: Float!')
  })

  describe('after changing price from float to int', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>
      const product = catalogs.find((c) => c.name === 'products') as Record<string, unknown>
      const fields = product.fields as Array<Record<string, unknown>>
      const price = fields.find((f) => f.name === 'price') as Record<string, unknown>
      price.type = 'int'

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds', () => {
      runOrFail('tsc', 'npx tsc --noEmit', { cwd: fresh.backDir, timeout: 30000 })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    })

    it('Prisma schema shows price as Int', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toMatch(/price\s+Int/)
      expect(schema).not.toMatch(/price\s+Float/)
    })

    it('GraphQL typeDefs show price as Int!', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('price: Int!')
      expect(typeDefs).not.toContain('price: Float!')
    })
  })
})

// =========================================================================
// 6. Toggle required ↔ optional
// =========================================================================

describe('e2e schema change: toggle required/optional', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  it('initially title is required', () => {
    const typeDefs = fs.readFileSync(
      path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
      'utf-8',
    )
    expect(typeDefs).toContain('title: String!')
  })

  describe('after making title optional', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>
      const product = catalogs.find((c) => c.name === 'products') as Record<string, unknown>
      const fields = product.fields as Array<Record<string, unknown>>
      const title = fields.find((f) => f.name === 'title') as Record<string, unknown>
      title.required = false
      title.requiredOnInput = false

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds', () => {
      runOrFail('tsc', 'npx tsc --noEmit', { cwd: fresh.backDir, timeout: 30000 })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    })

    it('Prisma schema shows title as optional', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toMatch(/title\s+String\?/)
    })

    it('GraphQL type shows title without !', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      // Should be 'title: String' (no !) — but not 'title: String!'
      expect(typeDefs).not.toContain('title: String!')
      expect(typeDefs).toContain('title: String')
    })
  })

  describe('after making title required again', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>
      const product = catalogs.find((c) => c.name === 'products') as Record<string, unknown>
      const fields = product.fields as Array<Record<string, unknown>>
      const title = fields.find((f) => f.name === 'title') as Record<string, unknown>
      title.required = true
      title.requiredOnInput = true

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds', () => {
      runOrFail('tsc', 'npx tsc --noEmit', { cwd: fresh.backDir, timeout: 30000 })
    })

    it('Prisma schema shows title as required again', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toMatch(/title\s+String[^?]/)
    })

    it('GraphQL type shows title: String! again', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('title: String!')
    })
  })
})

// =========================================================================
// 7. Add a relation between entities
// =========================================================================

describe('e2e schema change: add relation', () => {
  let fresh: FreshBackend

  beforeAll(async () => {
    // Start with with-catalog (Product only), add Tag entity, then link Product → Tag
    fresh = await prepareBackendFresh('with-catalog')
  }, 180000)

  afterAll(() => {
    cleanupFresh(fresh)
  })

  describe('after adding Tag entity and linking Product to Tag', () => {
    beforeAll(async () => {
      const metadata = readMetadata(fresh.workDir)
      const catalogs = metadata.catalogs as Array<Record<string, unknown>>

      // 1. Add a Tag entity
      catalogs.push(
        makeCatalog({
          name: 'tags',
          title: { en: { singular: 'Tag', plural: 'Tags' } },
          titleField: 'label',
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
              name: 'label',
              type: 'string',
              category: 'scalar',
              required: true,
              requiredOnInput: true,
              searchable: true,
            }),
          ],
        }),
      )

      // 2. Add a link field (tagId) to Product pointing to tags
      const product = catalogs.find((c) => c.name === 'products') as Record<string, unknown>
      const fields = product.fields as Array<Record<string, unknown>>
      fields.push(
        makeField({
          name: 'tagId',
          type: 'string',
          category: 'link',
          required: false,
          requiredOnInput: false,
          filters: ['equal', 'in', 'not_in'],
          linkEntity: 'tags',
          externalEntity: 'tags',
          linkCategory: 'entity',
          predefinedLinkedEntity: 'none',
        }),
      )

      writeMetadata(fresh.workDir, metadata)
      await regenBackend(fresh)
    }, 120000)

    it('tsc --noEmit succeeds', () => {
      runOrFail('tsc', 'npx tsc --noEmit', { cwd: fresh.backDir, timeout: 30000 })
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: fresh.backDir,
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    })

    it('Prisma schema has Tag model', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toContain('model Tag {')
      expect(schema).toMatch(/label\s+String/)
    })

    it('Product has tagId with @relation', () => {
      const schema = fs.readFileSync(path.join(fresh.backDir, 'prisma/schema.prisma'), 'utf-8')
      expect(schema).toMatch(/tagId\s+String\?/)
      expect(schema).toContain('@relation')
    })

    it('Product GraphQL typeDefs include tagId', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('tagId')
    })

    it('Product filter has link filter fields', () => {
      const typeDefs = fs.readFileSync(
        path.join(fresh.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )
      expect(typeDefs).toContain('tagId: String')
      expect(typeDefs).toContain('tagId_in: [String]')
      expect(typeDefs).toContain('tagId_not_in: [String]')
    })

    // --- API: verify the relation works end-to-end ---

    describe('API: relation works via GraphQL', () => {
      let server: StartedServer
      let dbUrl: string

      interface Product {
        id: string
        title: string
        price: number
        tagId: string | null
      }

      interface Tag {
        id: string
        label: string
      }

      let products: CrudClient<Product>
      let tags: CrudClient<Tag>

      beforeAll(async () => {
        dbUrl = databaseUrl('test_schema_relation')

        runOrFail('prisma db push', 'npx prisma db push --force-reset --accept-data-loss', {
          cwd: fresh.backDir,
          timeout: 30000,
          env: { ...process.env, DATABASE_MAIN_WRITE_URI: dbUrl },
        })

        server = await startServer(fresh.backDir, dbUrl)
        products = createCrudClient<Product>(server, 'Product', 'id title price tagId')
        tags = createCrudClient<Tag>(server, 'Tag', 'id label')
      }, 60000)

      afterAll(async () => {
        await stopServer(server)
      })

      it('creates a tag and a product linked to it', async () => {
        const t = await tags.create({ id: 'tag-1', label: 'Electronics' })
        expect(t.errors).toBeUndefined()

        const p = await products.create({
          id: 'prod-1',
          title: 'Widget',
          price: 9.99,
          tagId: 'tag-1',
        })
        expect(p.errors).toBeUndefined()
        expect(p.data?.createProduct?.tagId).toBe('tag-1')
      })

      it('creates product without tag (null link)', async () => {
        const p = await products.create({ id: 'prod-2', title: 'Untagged', price: 1 })
        expect(p.errors).toBeUndefined()
        expect(p.data?.createProduct?.tagId).toBeNull()
      })

      it('filters products by tagId', async () => {
        const r = await products.findAll({ filter: { tagId: 'tag-1' } })
        expect(r.errors).toBeUndefined()
        const titles = r.data?.allProducts?.map((p: Product) => p.title) ?? []
        expect(titles).toContain('Widget')
        expect(titles).not.toContain('Untagged')
      })

      it('filters products by tagId_in', async () => {
        const r = await products.findAll({ filter: { tagId_in: ['tag-1'] } })
        expect(r.errors).toBeUndefined()
        const titles = r.data?.allProducts?.map((p: Product) => p.title) ?? []
        expect(titles).toContain('Widget')
      })

      it('updates product to unlink tag', async () => {
        const r = await products.update({
          id: 'prod-1',
          title: 'Widget',
          price: 9.99,
          tagId: null,
        })
        expect(r.errors).toBeUndefined()
        expect(r.data?.updateProduct?.tagId).toBeNull()
      })
    })
  })
})
