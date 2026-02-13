import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

interface Category {
  id: string
  name: string
}

interface Article {
  id: string
  title: string
  categoryId: string | null
}

describe('e2e: GraphQL API for linked entities', () => {
  let ctx: SetupServerResult
  let categories: CrudClient<Category>
  let articles: CrudClient<Article>

  beforeAll(async () => {
    ctx = await setupServer('with-relations', 'test_relations_api')
    categories = createCrudClient<Category>(ctx.server, 'Category', 'id name', 'Categories')
    articles = createCrudClient<Article>(ctx.server, 'Article', 'id title categoryId')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createCategory(data: Record<string, unknown>): Promise<Category> {
    const r = await categories.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createCategory as Category
  }

  async function createArticle(data: Record<string, unknown>): Promise<Article> {
    const r = await articles.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createArticle as Article
  }

  async function cleanup(
    ...ids: Array<{ type: 'category' | 'article'; id: string }>
  ): Promise<void> {
    // Remove articles first (FK dependency)
    for (const item of ids.filter((i) => i.type === 'article')) {
      await articles.remove(item.id)
    }
    for (const item of ids.filter((i) => i.type === 'category')) {
      await categories.remove(item.id)
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Multi-entity CRUD
  // ---------------------------------------------------------------------------

  describe('multi-entity CRUD', () => {
    it('creates categories and articles independently', async () => {
      const cat = await createCategory({ id: 'cat-1', name: 'Tech' })
      const art = await createArticle({ id: 'art-1', title: 'Intro to AI', categoryId: 'cat-1' })

      expect(cat.id).toBe('cat-1')
      expect(art.categoryId).toBe('cat-1')

      await cleanup({ type: 'article', id: 'art-1' }, { type: 'category', id: 'cat-1' })
    })

    it('reads article with its categoryId', async () => {
      await createCategory({ id: 'cat-2', name: 'Science' })
      await createArticle({ id: 'art-2', title: 'Quantum Physics', categoryId: 'cat-2' })

      const r = await articles.findOne('art-2')
      expect(r.errors).toBeUndefined()
      expect(r.data?.Article?.title).toBe('Quantum Physics')
      expect(r.data?.Article?.categoryId).toBe('cat-2')

      await cleanup({ type: 'article', id: 'art-2' }, { type: 'category', id: 'cat-2' })
    })

    it('creates article without category (null link)', async () => {
      const art = await createArticle({ id: 'art-3', title: 'Standalone' })
      expect(art.categoryId).toBeNull()

      await cleanup({ type: 'article', id: 'art-3' })
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Link field filtering
  // ---------------------------------------------------------------------------

  describe('link field filtering', () => {
    it('filters articles by categoryId (equal)', async () => {
      await createCategory({ id: 'fcat-1', name: 'Cat A' })
      await createCategory({ id: 'fcat-2', name: 'Cat B' })
      await createArticle({ id: 'fart-1', title: 'A1', categoryId: 'fcat-1' })
      await createArticle({ id: 'fart-2', title: 'A2', categoryId: 'fcat-1' })
      await createArticle({ id: 'fart-3', title: 'B1', categoryId: 'fcat-2' })

      const r = await articles.findAll({ filter: { categoryId: 'fcat-1' } })
      expect(r.errors).toBeUndefined()
      const titles = r.data?.allArticles?.map((a: Article) => a.title)
      expect(titles).toContain('A1')
      expect(titles).toContain('A2')
      expect(titles).not.toContain('B1')

      await cleanup(
        { type: 'article', id: 'fart-1' },
        { type: 'article', id: 'fart-2' },
        { type: 'article', id: 'fart-3' },
        { type: 'category', id: 'fcat-1' },
        { type: 'category', id: 'fcat-2' },
      )
    })

    it('filters articles by categoryId_in', async () => {
      await createCategory({ id: 'in-1', name: 'X' })
      await createCategory({ id: 'in-2', name: 'Y' })
      await createCategory({ id: 'in-3', name: 'Z' })
      await createArticle({ id: 'in-a1', title: 'InX', categoryId: 'in-1' })
      await createArticle({ id: 'in-a2', title: 'InY', categoryId: 'in-2' })
      await createArticle({ id: 'in-a3', title: 'InZ', categoryId: 'in-3' })

      const r = await articles.findAll({ filter: { categoryId_in: ['in-1', 'in-2'] } })
      expect(r.errors).toBeUndefined()
      const titles = r.data?.allArticles?.map((a: Article) => a.title)
      expect(titles).toContain('InX')
      expect(titles).toContain('InY')
      expect(titles).not.toContain('InZ')

      await cleanup(
        { type: 'article', id: 'in-a1' },
        { type: 'article', id: 'in-a2' },
        { type: 'article', id: 'in-a3' },
        { type: 'category', id: 'in-1' },
        { type: 'category', id: 'in-2' },
        { type: 'category', id: 'in-3' },
      )
    })

    it('filters articles by categoryId_not_in', async () => {
      await createCategory({ id: 'ni-1', name: 'Keep' })
      await createCategory({ id: 'ni-2', name: 'Exclude' })
      await createArticle({ id: 'ni-a1', title: 'Kept', categoryId: 'ni-1' })
      await createArticle({ id: 'ni-a2', title: 'Excluded', categoryId: 'ni-2' })

      const r = await articles.findAll({ filter: { categoryId_not_in: ['ni-2'] } })
      expect(r.errors).toBeUndefined()
      const titles = r.data?.allArticles?.map((a: Article) => a.title)
      expect(titles).toContain('Kept')
      expect(titles).not.toContain('Excluded')

      await cleanup(
        { type: 'article', id: 'ni-a1' },
        { type: 'article', id: 'ni-a2' },
        { type: 'category', id: 'ni-1' },
        { type: 'category', id: 'ni-2' },
      )
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Update link field
  // ---------------------------------------------------------------------------

  describe('update link field', () => {
    it('changes category of an article', async () => {
      await createCategory({ id: 'uc-1', name: 'Old Cat' })
      await createCategory({ id: 'uc-2', name: 'New Cat' })
      await createArticle({ id: 'uc-a', title: 'Movable', categoryId: 'uc-1' })

      const r = await articles.update({ id: 'uc-a', title: 'Movable', categoryId: 'uc-2' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateArticle?.categoryId).toBe('uc-2')

      await cleanup(
        { type: 'article', id: 'uc-a' },
        { type: 'category', id: 'uc-1' },
        { type: 'category', id: 'uc-2' },
      )
    })

    it('sets category to null (unlink)', async () => {
      await createCategory({ id: 'un-1', name: 'Temp' })
      await createArticle({ id: 'un-a', title: 'Unlinkable', categoryId: 'un-1' })

      const r = await articles.update({ id: 'un-a', title: 'Unlinkable', categoryId: null })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateArticle?.categoryId).toBeNull()

      await cleanup({ type: 'article', id: 'un-a' }, { type: 'category', id: 'un-1' })
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Count across entities
  // ---------------------------------------------------------------------------

  describe('count', () => {
    it('counts categories and articles independently', async () => {
      await createCategory({ id: 'cc-1', name: 'CntCat' })
      await createArticle({ id: 'cc-a1', title: 'CntArt1', categoryId: 'cc-1' })
      await createArticle({ id: 'cc-a2', title: 'CntArt2', categoryId: 'cc-1' })

      const catCount = await categories.count()
      expect(catCount.errors).toBeUndefined()
      expect(catCount.data?._allCategoriesMeta?.count).toBeGreaterThanOrEqual(1)

      const artCount = await articles.count()
      expect(artCount.errors).toBeUndefined()
      expect(artCount.data?._allArticlesMeta?.count).toBeGreaterThanOrEqual(2)

      await cleanup(
        { type: 'article', id: 'cc-a1' },
        { type: 'article', id: 'cc-a2' },
        { type: 'category', id: 'cc-1' },
      )
    })
  })
})
