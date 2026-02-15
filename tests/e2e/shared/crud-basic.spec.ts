/**
 * Shared e2e test: basic CRUD operations on a catalog entity (with-auto-id).
 *
 * This test is backend-agnostic — it runs against whichever implementation
 * is selected via the BACKEND env var (default: 'java').
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getBackend } from '../backend-under-test.js'
import { type CrudClient, createCrudClient } from '../graphql-client.js'
import type { StartedServer } from '../prepare-backend.js'

interface Item {
  id: number
  name: string
  quantity: number
  active: boolean
  description: string | null
  search: string | null
}

const backend = getBackend()

describe(`shared e2e [${backend.name}]: basic CRUD (with-auto-id)`, () => {
  let server: StartedServer
  let items: CrudClient<Item>

  beforeAll(async () => {
    server = await backend.start('with-auto-id', `shared_crud_${backend.name}`)
    items = createCrudClient<Item>(server, 'Item', 'id name quantity active description')
  }, 120_000)

  afterAll(async () => {
    await backend.stop(server)
  })

  it('creates an item (auto-increment id)', async () => {
    const r = await items.create({ name: 'Widget', quantity: 10, active: true })

    expect(r.errors).toBeUndefined()
    expect(r.data?.createItem?.id).toBeGreaterThan(0)
    expect(r.data?.createItem?.name).toBe('Widget')
    expect(r.data?.createItem?.quantity).toBe(10)
    expect(r.data?.createItem?.active).toBe(true)
  })

  it('reads an item by id', async () => {
    const c = await items.create({ name: 'Gizmo', quantity: 5, active: false })
    const id = c.data?.createItem?.id as number

    const r = await items.findOne(id)

    expect(r.errors).toBeUndefined()
    expect(r.data?.Item?.name).toBe('Gizmo')
    expect(r.data?.Item?.quantity).toBe(5)
    expect(r.data?.Item?.active).toBe(false)
  })

  it('updates an item', async () => {
    const c = await items.create({ name: 'Alpha', quantity: 1, active: true })
    const id = c.data?.createItem?.id as number

    const r = await items.update({ id, name: 'Beta', quantity: 99 })

    expect(r.errors).toBeUndefined()
    expect(r.data?.updateItem?.name).toBe('Beta')
    expect(r.data?.updateItem?.quantity).toBe(99)
    expect(r.data?.updateItem?.active).toBe(true)
  })

  it('removes an item', async () => {
    const c = await items.create({ name: 'ToDelete', quantity: 0, active: true })
    const id = c.data?.createItem?.id as number

    const r = await items.remove(id)

    expect(r.errors).toBeUndefined()
    expect(r.data?.removeItem?.id).toBe(id)
    expect(r.data?.removeItem?.name).toBe('ToDelete')

    const check = await items.findOne(id)
    expect(check.data?.Item).toBeNull()
  })
})
