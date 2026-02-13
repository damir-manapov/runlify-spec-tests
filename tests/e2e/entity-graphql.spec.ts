import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type PreparedBackend,
  prepareBackend,
  runOrFail,
  teardownBackend,
} from './prepare-backend.js'

describe('e2e: generated entity GraphQL layer', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend('with-catalog')
  }, 180000)

  afterAll(() => {
    teardownBackend({ prepared })
  })

  // it('tsc --noEmit succeeds with entity code', () => {
  //   runOrFail('tsc', 'npx tsc --noEmit', {
  //     cwd: prepared.backDir,
  //     timeout: 30000,
  //   })
  // })

  describe('generated GraphQL files', () => {
    it('creates graph service directory for the entity', () => {
      const graphDir = path.join(prepared.backDir, 'src/adm/graph/services/products')

      expect(fs.existsSync(graphDir)).toBe(true)

      const files = fs.readdirSync(graphDir)
      expect(files).toContain('baseTypeDefs.ts')
      expect(files).toContain('baseResolvers.ts')
      expect(files).toContain('permissionsToGraphql.ts')
    })

    it('typeDefs define Product type with correct fields', () => {
      const typeDefs = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )

      expect(typeDefs).toContain('type Product {')
      expect(typeDefs).toContain('id: ID!')
      expect(typeDefs).toContain('title: String!')
      expect(typeDefs).toContain('price: Float!')
    })

    it('typeDefs define CRUD queries', () => {
      const typeDefs = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )

      expect(typeDefs).toContain('Product(id: ID!): Product')
      expect(typeDefs).toContain('allProducts(')
      expect(typeDefs).toContain('_allProductsMeta(')
    })

    it('typeDefs define CRUD mutations', () => {
      const typeDefs = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )

      expect(typeDefs).toContain('createProduct(')
      expect(typeDefs).toContain('updateProduct(')
      expect(typeDefs).toContain('removeProduct(')
    })

    it('typeDefs define filter input type', () => {
      const typeDefs = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/graph/services/products/baseTypeDefs.ts'),
        'utf-8',
      )

      expect(typeDefs).toContain('input ProductFilter {')
      expect(typeDefs).toContain('q: String')
      expect(typeDefs).toContain('price_lte: Float')
      expect(typeDefs).toContain('price_gte: Float')
    })

    it('resolvers delegate to service layer', () => {
      const resolvers = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/graph/services/products/baseResolvers.ts'),
        'utf-8',
      )

      expect(resolvers).toContain("context.service('products').get(")
      expect(resolvers).toContain("context.service('products').all(")
      expect(resolvers).toContain("context.service('products').meta(")
      expect(resolvers).toContain("context.service('products').create(")
      expect(resolvers).toContain("context.service('products').update(")
      expect(resolvers).toContain("context.service('products').delete(")
    })
  })

  describe('generated service layer', () => {
    it('creates service directory for the entity', () => {
      const serviceDir = path.join(prepared.backDir, 'src/adm/services/ProductsService')

      expect(fs.existsSync(serviceDir)).toBe(true)

      const files = fs.readdirSync(serviceDir)
      expect(files).toContain('ProductsService.ts')
      expect(files).toContain('config.ts')
      expect(files).toContain('initBuiltInHooks.ts')
      expect(files).toContain('initUserHooks.ts')
    })

    it('service extends BaseService', () => {
      const service = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/services/ProductsService/ProductsService.ts'),
        'utf-8',
      )

      expect(service).toContain('class ProductsService extends BaseService<')
      expect(service).toContain('Prisma.ProductDelegate')
    })

    it('service config has correct entity settings', () => {
      const config = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/services/ProductsService/config.ts'),
        'utf-8',
      )

      expect(config).toContain("idType: 'string'")
      expect(config).toContain('Entity.Product')
    })

    it('service is registered in BaseServices', () => {
      const baseServices = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/services/BaseServices.ts'),
        'utf-8',
      )

      expect(baseServices).toContain('products:')
      expect(baseServices).toContain('ProductsService')
    })

    it('service constructor is registered', () => {
      const constructors = fs.readFileSync(
        path.join(prepared.backDir, 'src/adm/services/serviceConstrictors.ts'),
        'utf-8',
      )

      expect(constructors).toContain('products:')
    })
  })

  describe('generated Prisma model', () => {
    it('schema includes Product model with fields', () => {
      const schema = fs.readFileSync(path.join(prepared.backDir, 'prisma/schema.prisma'), 'utf-8')

      expect(schema).toContain('model Product {')
      expect(schema).toMatch(/id\s+String\s+@id/)
      expect(schema).toContain('title')
      expect(schema).toContain('price')
      expect(schema).toContain('Float')
    })

    it('prisma validate succeeds', () => {
      runOrFail('prisma validate', 'npx prisma validate', {
        cwd: prepared.backDir,
        timeout: 15000,
        env: { ...process.env, DATABASE_MAIN_WRITE_URI: 'postgresql://localhost:5432/test' },
      })
    })
  })
})
