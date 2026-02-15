/**
 * Shared e2e: document entity CRUD.
 *
 * Covers float fields, datetime fields, optional string fields,
 * full-text search, sorting, ids filter — for a document entity type.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getBackend } from '../backend-under-test.js'
import { type CrudClient, createCrudClient } from '../graphql-client.js'
import type { StartedServer } from '../prepare-backend.js'

interface Order {
  id: string
  date: string
  code: string
  total: number
  notes: string | null
}

const backend = getBackend()
const FIELDS = 'id date code total notes'
const isoDate = '2024-06-15T10:30:00.000Z'

describe(`shared e2e [${backend.name}]: document entity (with-document)`, () => {
  let server: StartedServer
  let orders: CrudClient<Order>

  beforeAll(async () => {
    server = await backend.start('with-document', `shared_doc_${backend.name}`)
    orders = createCrudClient<Order>(server, 'Order', FIELDS)
  }, 240_000)

  afterAll(async () => {
    await backend.stop(server)
  })

  async function createOk(data: Record<string, unknown>): Promise<Order> {
    const r = await orders.create(data)
    expect(r.errors).toBeUndefined()
    return r.data?.createOrder as Order
  }

  async function removeQuiet(id: string): Promise<void> {
    await orders.remove(id)
  }

  // -----------------------------------------------------------------------
  // Basic CRUD
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Float (money) field
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Datetime field
  // -----------------------------------------------------------------------

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

    it('sorts by date DESC', async () => {
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

  // -----------------------------------------------------------------------
  // Optional multiline string field
  // -----------------------------------------------------------------------

  describe('optional string field (notes)', () => {
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

  // -----------------------------------------------------------------------
  // Count, search, ids
  // -----------------------------------------------------------------------

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

  describe('full-text search (q filter)', () => {
    it('finds orders by code substring', async () => {
      await createOk({ id: 'q-1', date: isoDate, code: 'SPECIAL-ORDER', total: 1 })
      await createOk({ id: 'q-2', date: isoDate, code: 'NORMAL-ORDER', total: 1 })

      const r = await orders.findAll({ filter: { q: 'SPECIAL' } })
      expect(r.errors).toBeUndefined()
      const codes = r.data?.allOrders?.map((o: Order) => o.code) ?? []
      expect(codes).toContain('SPECIAL-ORDER')
      expect(codes).not.toContain('NORMAL-ORDER')

      await removeQuiet('q-1')
      await removeQuiet('q-2')
    })
  })

  describe('findOne non-existent', () => {
    it('returns null for non-existent id', async () => {
      const r = await orders.findOne('does-not-exist')
      expect(r.errors).toBeUndefined()
      expect(r.data?.Order).toBeNull()
    })
  })

  describe('ids bulk filter', () => {
    it('filters by list of ids', async () => {
      await createOk({ id: 'ids-1', date: isoDate, code: 'IDS-1', total: 1 })
      await createOk({ id: 'ids-2', date: isoDate, code: 'IDS-2', total: 2 })
      await createOk({ id: 'ids-3', date: isoDate, code: 'IDS-3', total: 3 })

      const r = await orders.findAll({ filter: { ids: ['ids-1', 'ids-3'] } })
      expect(r.errors).toBeUndefined()
      const codes = r.data?.allOrders?.map((o: Order) => o.code) ?? []
      expect(codes).toContain('IDS-1')
      expect(codes).toContain('IDS-3')
      expect(codes).not.toContain('IDS-2')

      await removeQuiet('ids-1')
      await removeQuiet('ids-2')
      await removeQuiet('ids-3')
    })
  })
})
