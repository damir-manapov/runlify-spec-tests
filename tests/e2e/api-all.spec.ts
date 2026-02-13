import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

// ---------------------------------------------------------------------------
// 1. Auto-generated int id  (with-auto-id / Item)
// ---------------------------------------------------------------------------

interface Item {
  id: number
  name: string
  quantity: number
  active: boolean
  description: string | null
  createdAt: string | null
}

describe('e2e API: auto-generated int id (with-auto-id)', () => {
  let ctx: SetupServerResult
  let items: CrudClient<Item>

  beforeAll(async () => {
    ctx = await setupServer('with-auto-id', 'test_auto_id_api')
    items = createCrudClient<Item>(
      ctx.server,
      'Item',
      'id name quantity active description createdAt',
    )
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  async function createOk(data: Record<string, unknown>): Promise<Item> {
    const r = await items.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createItem as Item
  }

  async function removeQuiet(id: number): Promise<void> {
    await items.remove(id)
  }

  describe('auto-generated int id', () => {
    it('creates item without providing id — server assigns one', async () => {
      const item = await createOk({ name: 'Widget', quantity: 10, active: true })
      expect(item.id).toBeTypeOf('number')
      expect(item.id).toBeGreaterThan(0)
      expect(item.name).toBe('Widget')
      await removeQuiet(item.id)
    })

    it('creates two items — ids are distinct', async () => {
      const a = await createOk({ name: 'A', quantity: 1, active: true })
      const b = await createOk({ name: 'B', quantity: 2, active: true })
      expect(a.id).not.toBe(b.id)
      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('reads item by integer id', async () => {
      const created = await createOk({ name: 'ReadMe', quantity: 5, active: false })
      const r = await items.findOne(created.id)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Item?.name).toBe('ReadMe')
      expect(r.data?.Item?.quantity).toBe(5)
      await removeQuiet(created.id)
    })

    it('updates item by integer id', async () => {
      const created = await createOk({ name: 'Old', quantity: 1, active: true })
      const r = await items.update({ id: created.id, name: 'New', quantity: 99, active: true })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.name).toBe('New')
      expect(r.data?.updateItem?.quantity).toBe(99)
      await removeQuiet(created.id)
    })

    it('removes item by integer id', async () => {
      const created = await createOk({ name: 'Gone', quantity: 0, active: false })
      const r = await items.remove(created.id)
      expect(r.errors).toBeUndefined()
      const check = await items.findOne(created.id)
      expect(check.data?.Item).toBeNull()
    })
  })

  describe('boolean field', () => {
    it('stores true and retrieves it', async () => {
      const item = await createOk({ name: 'BoolTrue', quantity: 1, active: true })
      expect(item.active).toBe(true)
      await removeQuiet(item.id)
    })

    it('stores false and retrieves it', async () => {
      const item = await createOk({ name: 'BoolFalse', quantity: 1, active: false })
      expect(item.active).toBe(false)
      await removeQuiet(item.id)
    })

    it('updates boolean from true to false', async () => {
      const item = await createOk({ name: 'Flip', quantity: 1, active: true })
      const r = await items.update({ id: item.id, name: 'Flip', quantity: 1, active: false })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.active).toBe(false)
      await removeQuiet(item.id)
    })
  })

  describe('optional fields', () => {
    it('creates item with optional fields null by default', async () => {
      const item = await createOk({ name: 'Minimal', quantity: 1, active: true })
      expect(item.description).toBeNull()
      expect(item.createdAt).toBeNull()
      await removeQuiet(item.id)
    })

    it('creates item with optional fields provided', async () => {
      const now = new Date().toISOString()
      const item = await createOk({
        name: 'Full',
        quantity: 1,
        active: true,
        description: 'A fine item',
        createdAt: now,
      })
      expect(item.description).toBe('A fine item')
      expect(item.createdAt).toBeTruthy()
      await removeQuiet(item.id)
    })

    it('updates optional field from null to value', async () => {
      const item = await createOk({ name: 'Upgrade', quantity: 1, active: true })
      const r = await items.update({
        id: item.id,
        name: 'Upgrade',
        quantity: 1,
        active: true,
        description: 'Now described',
      })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.description).toBe('Now described')
      await removeQuiet(item.id)
    })

    it('updates optional field from value to null', async () => {
      const item = await createOk({
        name: 'Downgrade',
        quantity: 1,
        active: true,
        description: 'Has desc',
      })
      const r = await items.update({
        id: item.id,
        name: 'Downgrade',
        quantity: 1,
        active: true,
        description: null,
      })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateItem?.description).toBeNull()
      await removeQuiet(item.id)
    })
  })

  describe('integer field filtering', () => {
    it('filters quantity by lte and gte', async () => {
      const a = await createOk({ name: 'Low', quantity: 5, active: true })
      const b = await createOk({ name: 'Mid', quantity: 50, active: true })
      const c = await createOk({ name: 'High', quantity: 500, active: true })

      const r = await items.findAll({ filter: { quantity_gte: 10, quantity_lte: 100 } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name)
      expect(names).toContain('Mid')
      expect(names).not.toContain('Low')
      expect(names).not.toContain('High')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
      await removeQuiet(c.id)
    })
  })

  describe('datetime field filtering', () => {
    it('filters createdAt by gte', async () => {
      const past = '2020-01-01T00:00:00.000Z'
      const future = '2099-12-31T23:59:59.000Z'
      const a = await createOk({ name: 'Old', quantity: 1, active: true, createdAt: past })
      const b = await createOk({ name: 'Future', quantity: 1, active: true, createdAt: future })

      const r = await items.findAll({ filter: { createdAt_gte: '2050-01-01T00:00:00.000Z' } })
      expect(r.errors).toBeUndefined()
      const names = r.data?.allItems?.map((i: Item) => i.name)
      expect(names).toContain('Future')
      expect(names).not.toContain('Old')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })

  describe('sorting', () => {
    it('sorts by quantity ASC', async () => {
      const a = await createOk({ name: 'Z', quantity: 30, active: true })
      const b = await createOk({ name: 'A', quantity: 10, active: true })
      const c = await createOk({ name: 'M', quantity: 20, active: true })

      const r = await items.findAll({ sortField: 'quantity', sortOrder: 'ASC' })
      expect(r.errors).toBeUndefined()
      const quantities = r.data?.allItems?.map((i: Item) => i.quantity) ?? []
      expect(quantities).toEqual([...quantities].sort((a, b) => a - b))

      await removeQuiet(a.id)
      await removeQuiet(b.id)
      await removeQuiet(c.id)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Document entity  (with-document / Order)
// ---------------------------------------------------------------------------

interface Order {
  id: string
  date: string
  code: string
  total: number
  notes: string | null
}

describe('e2e API: document entity (with-document)', () => {
  let ctx: SetupServerResult
  let orders: CrudClient<Order>

  beforeAll(async () => {
    ctx = await setupServer('with-document', 'test_document_api')
    orders = createCrudClient<Order>(ctx.server, 'Order', 'id date code total notes')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  const isoDate = '2024-06-15T10:30:00.000Z'

  async function createOk(data: Record<string, unknown>): Promise<Order> {
    const r = await orders.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createOrder as Order
  }

  async function removeQuiet(id: string): Promise<void> {
    await orders.remove(id)
  }

  describe('basic CRUD', () => {
    it('creates an order with required fields', async () => {
      const order = await createOk({ id: 'ord-1', date: isoDate, code: 'ORD-001', total: 99.99 })
      expect(order.id).toBe('ord-1')
      expect(order.code).toBe('ORD-001')
      expect(order.total).toBe(99.99)
      expect(order.notes).toBeNull()
      await removeQuiet('ord-1')
    })

    it('reads an order by id', async () => {
      await createOk({ id: 'ord-2', date: isoDate, code: 'ORD-002', total: 50 })
      const r = await orders.findOne('ord-2')
      expect(r.errors).toBeUndefined()
      expect(r.data?.Order?.code).toBe('ORD-002')
      await removeQuiet('ord-2')
    })

    it('updates an order', async () => {
      await createOk({ id: 'ord-3', date: isoDate, code: 'ORD-003', total: 10 })
      const r = await orders.update({
        id: 'ord-3',
        date: isoDate,
        code: 'ORD-003-UPDATED',
        total: 20.5,
      })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateOrder?.code).toBe('ORD-003-UPDATED')
      expect(r.data?.updateOrder?.total).toBe(20.5)
      await removeQuiet('ord-3')
    })

    it('removes an order', async () => {
      await createOk({ id: 'ord-4', date: isoDate, code: 'ORD-004', total: 0 })
      const r = await orders.remove('ord-4')
      expect(r.errors).toBeUndefined()
      const check = await orders.findOne('ord-4')
      expect(check.data?.Order).toBeNull()
    })
  })

  describe('float (money) field', () => {
    it('stores decimal precision', async () => {
      const order = await createOk({ id: 'flt-1', date: isoDate, code: 'FLT-1', total: 123.45 })
      expect(order.total).toBe(123.45)
      await removeQuiet('flt-1')
    })

    it('stores zero', async () => {
      const order = await createOk({ id: 'flt-2', date: isoDate, code: 'FLT-2', total: 0 })
      expect(order.total).toBe(0)
      await removeQuiet('flt-2')
    })

    it('stores negative value', async () => {
      const order = await createOk({ id: 'flt-3', date: isoDate, code: 'FLT-3', total: -15.5 })
      expect(order.total).toBe(-15.5)
      await removeQuiet('flt-3')
    })

    it('filters total by lte and gte', async () => {
      await createOk({ id: 'flt-a', date: isoDate, code: 'FLT-A', total: 10 })
      await createOk({ id: 'flt-b', date: isoDate, code: 'FLT-B', total: 100 })
      await createOk({ id: 'flt-c', date: isoDate, code: 'FLT-C', total: 1000 })

      const r = await orders.findAll({ filter: { total_gte: 50, total_lte: 500 } })
      expect(r.errors).toBeUndefined()
      const codes = r.data?.allOrders?.map((o: Order) => o.code)
      expect(codes).toContain('FLT-B')
      expect(codes).not.toContain('FLT-A')
      expect(codes).not.toContain('FLT-C')

      await removeQuiet('flt-a')
      await removeQuiet('flt-b')
      await removeQuiet('flt-c')
    })
  })

  describe('datetime field', () => {
    it('stores and retrieves datetime value', async () => {
      const order = await createOk({
        id: 'dt-1',
        date: '2024-03-15T14:30:00.000Z',
        code: 'DT-1',
        total: 1,
      })
      expect(order.date).toBeTruthy()
      await removeQuiet('dt-1')
    })

    it('filters by date range (lte/gte)', async () => {
      await createOk({ id: 'dt-a', date: '2024-01-01T00:00:00.000Z', code: 'JAN', total: 1 })
      await createOk({ id: 'dt-b', date: '2024-06-15T00:00:00.000Z', code: 'JUN', total: 1 })
      await createOk({ id: 'dt-c', date: '2024-12-31T00:00:00.000Z', code: 'DEC', total: 1 })

      const r = await orders.findAll({
        filter: { date_gte: '2024-03-01T00:00:00.000Z', date_lte: '2024-09-01T00:00:00.000Z' },
      })
      expect(r.errors).toBeUndefined()
      const codes = r.data?.allOrders?.map((o: Order) => o.code)
      expect(codes).toContain('JUN')
      expect(codes).not.toContain('JAN')
      expect(codes).not.toContain('DEC')

      await removeQuiet('dt-a')
      await removeQuiet('dt-b')
      await removeQuiet('dt-c')
    })

    it('sorts by date DESC (default for documents)', async () => {
      await createOk({ id: 'dt-s1', date: '2024-01-01T00:00:00.000Z', code: 'FIRST', total: 1 })
      await createOk({ id: 'dt-s2', date: '2024-12-31T00:00:00.000Z', code: 'LAST', total: 1 })

      const r = await orders.findAll({ sortField: 'date', sortOrder: 'DESC' })
      expect(r.errors).toBeUndefined()
      const codes = r.data?.allOrders?.map((o: Order) => o.code) ?? []
      expect(codes.indexOf('LAST')).toBeLessThan(codes.indexOf('FIRST'))

      await removeQuiet('dt-s1')
      await removeQuiet('dt-s2')
    })
  })

  describe('optional multiline string field', () => {
    it('creates order with notes', async () => {
      const order = await createOk({
        id: 'note-1',
        date: isoDate,
        code: 'NOTE-1',
        total: 1,
        notes: 'Line 1\nLine 2\nLine 3',
      })
      expect(order.notes).toBe('Line 1\nLine 2\nLine 3')
      await removeQuiet('note-1')
    })

    it('creates order without notes — defaults to null', async () => {
      const order = await createOk({ id: 'note-2', date: isoDate, code: 'NOTE-2', total: 1 })
      expect(order.notes).toBeNull()
      await removeQuiet('note-2')
    })

    it('updates notes from null to value', async () => {
      await createOk({ id: 'note-3', date: isoDate, code: 'NOTE-3', total: 1 })
      const r = await orders.update({
        id: 'note-3',
        date: isoDate,
        code: 'NOTE-3',
        total: 1,
        notes: 'Added notes',
      })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateOrder?.notes).toBe('Added notes')
      await removeQuiet('note-3')
    })
  })

  describe('count', () => {
    it('returns correct count', async () => {
      await createOk({ id: 'cnt-1', date: isoDate, code: 'CNT-1', total: 1 })
      await createOk({ id: 'cnt-2', date: isoDate, code: 'CNT-2', total: 2 })

      const r = await orders.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allOrdersMeta?.count).toBeGreaterThanOrEqual(2)

      await removeQuiet('cnt-1')
      await removeQuiet('cnt-2')
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Linked entities  (with-relations / Category + Article)
// ---------------------------------------------------------------------------

interface Category {
  id: string
  name: string
}

interface Article {
  id: string
  title: string
  categoryId: string | null
}

describe('e2e API: linked entities (with-relations)', () => {
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
    for (const item of ids.filter((i) => i.type === 'article')) {
      await articles.remove(item.id)
    }
    for (const item of ids.filter((i) => i.type === 'category')) {
      await categories.remove(item.id)
    }
  }

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

// ---------------------------------------------------------------------------
// 4. Manual int id  (with-manual-int-id / Entry)
// ---------------------------------------------------------------------------

interface Entry {
  id: number
  label: string
}

describe('e2e API: manual int id (with-manual-int-id)', () => {
  let ctx: SetupServerResult
  let entries: CrudClient<Entry>

  beforeAll(async () => {
    ctx = await setupServer('with-manual-int-id', 'test_manual_int_api')
    entries = createCrudClient<Entry>(ctx.server, 'Entry', 'id label', 'Entries')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  async function createOk(data: Record<string, unknown>): Promise<Entry> {
    const r = await entries.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createEntry as Entry
  }

  async function removeQuiet(id: number): Promise<void> {
    await entries.remove(id)
  }

  describe('user-provided int id', () => {
    it('creates entry with user-provided int id', async () => {
      const entry = await createOk({ id: 100, label: 'First' })
      expect(entry.id).toBe(100)
      expect(entry.label).toBe('First')
      await removeQuiet(100)
    })

    it('creates entry with another int id', async () => {
      const entry = await createOk({ id: 200, label: 'Second' })
      expect(entry.id).toBe(200)
      await removeQuiet(200)
    })

    it('reads entry by integer id', async () => {
      await createOk({ id: 300, label: 'ReadMe' })
      const r = await entries.findOne(300)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Entry?.label).toBe('ReadMe')
      await removeQuiet(300)
    })

    it('updates entry by integer id', async () => {
      await createOk({ id: 400, label: 'Old' })
      const r = await entries.update({ id: 400, label: 'New' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateEntry?.label).toBe('New')
      await removeQuiet(400)
    })

    it('removes entry by integer id', async () => {
      await createOk({ id: 500, label: 'Gone' })
      const r = await entries.remove(500)
      expect(r.errors).toBeUndefined()
      const check = await entries.findOne(500)
      expect(check.data?.Entry).toBeNull()
    })
  })

  describe('duplicate id', () => {
    it('rejects creating entry with duplicate id', async () => {
      await createOk({ id: 600, label: 'Original' })
      const r = await entries.create({ id: 600, label: 'Duplicate' })
      expect(r.errors).toBeDefined()
      await removeQuiet(600)
    })
  })

  describe('findAll and sorting', () => {
    it('lists all entries', async () => {
      await createOk({ id: 10, label: 'Alpha' })
      await createOk({ id: 20, label: 'Beta' })

      const r = await entries.findAll()
      expect(r.errors).toBeUndefined()
      const ids = r.data?.allEntries?.map((e: Entry) => e.id) ?? []
      expect(ids).toContain(10)
      expect(ids).toContain(20)

      await removeQuiet(10)
      await removeQuiet(20)
    })

    it('sorts entries by id ASC', async () => {
      await createOk({ id: 30, label: 'C' })
      await createOk({ id: 10, label: 'A' })
      await createOk({ id: 20, label: 'B' })

      const r = await entries.findAll({ sortField: 'id', sortOrder: 'ASC' })
      expect(r.errors).toBeUndefined()
      const ids = r.data?.allEntries?.map((e: Entry) => e.id) ?? []
      expect(ids).toEqual([...ids].sort((a, b) => a - b))

      await removeQuiet(10)
      await removeQuiet(20)
      await removeQuiet(30)
    })

    it('counts entries', async () => {
      await createOk({ id: 40, label: 'Count1' })
      await createOk({ id: 50, label: 'Count2' })

      const r = await entries.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allEntriesMeta?.count).toBeGreaterThanOrEqual(2)

      await removeQuiet(40)
      await removeQuiet(50)
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Auto-generated BigInt id  (with-bigint-id / Counter)
// ---------------------------------------------------------------------------

interface Counter {
  id: string // BigInt is serialized as string over GraphQL
  label: string
}

describe('e2e API: auto bigint id (with-bigint-id)', () => {
  let ctx: SetupServerResult
  let counters: CrudClient<Counter>

  beforeAll(async () => {
    ctx = await setupServer('with-bigint-id', 'test_bigint_api')
    counters = createCrudClient<Counter>(ctx.server, 'Counter', 'id label')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  async function createOk(data: Record<string, unknown>): Promise<Counter> {
    const r = await counters.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createCounter as Counter
  }

  async function removeQuiet(id: string): Promise<void> {
    await counters.remove(id)
  }

  describe('auto-generated bigint id', () => {
    it('creates counter without providing id — server assigns one', async () => {
      const counter = await createOk({ label: 'First' })
      expect(counter.id).toBeTruthy()
      expect(counter.label).toBe('First')
      await removeQuiet(counter.id)
    })

    it('creates two counters — ids are distinct', async () => {
      const a = await createOk({ label: 'A' })
      const b = await createOk({ label: 'B' })
      expect(a.id).not.toBe(b.id)
      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('reads counter by bigint id', async () => {
      const created = await createOk({ label: 'ReadMe' })
      const r = await counters.findOne(created.id)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Counter?.label).toBe('ReadMe')
      await removeQuiet(created.id)
    })

    it('updates counter by bigint id', async () => {
      const created = await createOk({ label: 'Old' })
      const r = await counters.update({ id: created.id, label: 'New' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateCounter?.label).toBe('New')
      await removeQuiet(created.id)
    })

    it('removes counter by bigint id', async () => {
      const created = await createOk({ label: 'Gone' })
      const r = await counters.remove(created.id)
      expect(r.errors).toBeUndefined()
      const check = await counters.findOne(created.id)
      expect(check.data?.Counter).toBeNull()
    })
  })

  describe('bigint serialization', () => {
    it('id is returned as string (BigInt scalar)', async () => {
      const counter = await createOk({ label: 'TypeCheck' })
      expect(typeof counter.id).toBe('string')
      expect(Number(counter.id)).toBeGreaterThan(0)
      await removeQuiet(counter.id)
    })
  })

  describe('findAll and sorting', () => {
    it('lists all counters', async () => {
      const a = await createOk({ label: 'Alpha' })
      const b = await createOk({ label: 'Beta' })

      const r = await counters.findAll()
      expect(r.errors).toBeUndefined()
      const labels = r.data?.allCounters?.map((c: Counter) => c.label) ?? []
      expect(labels).toContain('Alpha')
      expect(labels).toContain('Beta')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('counts counters', async () => {
      const a = await createOk({ label: 'C1' })
      const b = await createOk({ label: 'C2' })

      const r = await counters.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allCountersMeta?.count).toBeGreaterThanOrEqual(2)

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Auto-generated string id (cuid)  (with-auto-string-id / Ticket)
// ---------------------------------------------------------------------------

interface Ticket {
  id: string
  subject: string
}

describe('e2e API: auto string id / cuid (with-auto-string-id)', () => {
  let ctx: SetupServerResult
  let tickets: CrudClient<Ticket>

  beforeAll(async () => {
    ctx = await setupServer('with-auto-string-id', 'test_auto_string_api')
    tickets = createCrudClient<Ticket>(ctx.server, 'Ticket', 'id subject')
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  async function createOk(data: Record<string, unknown>): Promise<Ticket> {
    const r = await tickets.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createTicket as Ticket
  }

  async function removeQuiet(id: string): Promise<void> {
    await tickets.remove(id)
  }

  describe('auto-generated string id (cuid)', () => {
    it('creates ticket without providing id — server generates cuid', async () => {
      const ticket = await createOk({ subject: 'Bug report' })
      expect(ticket.id).toBeTypeOf('string')
      expect(ticket.id.length).toBeGreaterThan(0)
      expect(ticket.subject).toBe('Bug report')
      await removeQuiet(ticket.id)
    })

    it('creates two tickets — ids are distinct cuid strings', async () => {
      const a = await createOk({ subject: 'Issue A' })
      const b = await createOk({ subject: 'Issue B' })
      expect(a.id).not.toBe(b.id)
      expect(a.id).toBeTypeOf('string')
      expect(b.id).toBeTypeOf('string')
      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('generated id is a non-empty string (server-generated)', async () => {
      const ticket = await createOk({ subject: 'Id format check' })
      expect(ticket.id).toBeTypeOf('string')
      expect(ticket.id.length).toBeGreaterThan(10)
      await removeQuiet(ticket.id)
    })

    it('reads ticket by generated string id', async () => {
      const created = await createOk({ subject: 'ReadMe' })
      const r = await tickets.findOne(created.id)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Ticket?.subject).toBe('ReadMe')
      await removeQuiet(created.id)
    })

    it('updates ticket by generated string id', async () => {
      const created = await createOk({ subject: 'Old subject' })
      const r = await tickets.update({ id: created.id, subject: 'New subject' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.updateTicket?.subject).toBe('New subject')
      await removeQuiet(created.id)
    })

    it('removes ticket by generated string id', async () => {
      const created = await createOk({ subject: 'Gone' })
      const r = await tickets.remove(created.id)
      expect(r.errors).toBeUndefined()
      const check = await tickets.findOne(created.id)
      expect(check.data?.Ticket).toBeNull()
    })
  })

  describe('auto vs manual string id', () => {
    it('create does not require id field (unlike manual string id)', async () => {
      const ticket = await createOk({ subject: 'No id provided' })
      expect(ticket.id).toBeTruthy()
      await removeQuiet(ticket.id)
    })
  })

  describe('findAll and sorting', () => {
    it('lists all tickets', async () => {
      const a = await createOk({ subject: 'Alpha' })
      const b = await createOk({ subject: 'Beta' })

      const r = await tickets.findAll()
      expect(r.errors).toBeUndefined()
      const subjects = r.data?.allTickets?.map((t: Ticket) => t.subject) ?? []
      expect(subjects).toContain('Alpha')
      expect(subjects).toContain('Beta')

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('counts tickets', async () => {
      const a = await createOk({ subject: 'C1' })
      const b = await createOk({ subject: 'C2' })

      const r = await tickets.count()
      expect(r.errors).toBeUndefined()
      expect(r.data?._allTicketsMeta?.count).toBeGreaterThanOrEqual(2)

      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })
  })
})
