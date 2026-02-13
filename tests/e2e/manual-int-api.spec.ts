import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
import { type SetupServerResult, setupServer, teardownServer } from './prepare-backend.js'

interface Entry {
  id: number
  label: string
}

describe('e2e: GraphQL API for manual int id entity', () => {
  let ctx: SetupServerResult
  let entries: CrudClient<Entry>

  beforeAll(async () => {
    ctx = await setupServer('with-manual-int-id', 'test_manual_int_api')
    entries = createCrudClient<Entry>(
      ctx.server,
      'Entry',
      'id label',
      'Entries',
    )
  }, 240000)

  afterAll(async () => {
    await teardownServer(ctx)
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createOk(data: Record<string, unknown>): Promise<Entry> {
    const r = await entries.create(data)
    expect(r.errors).toBeUndefined()
    return r.data!.createEntry!
  }

  async function removeQuiet(id: number): Promise<void> {
    await entries.remove(id)
  }

  // ---------------------------------------------------------------------------
  // 1. User-provided int id
  // ---------------------------------------------------------------------------

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
      expect(check.data!.Entry).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Duplicate id handling
  // ---------------------------------------------------------------------------

  describe('duplicate id', () => {
    it('rejects creating entry with duplicate id', async () => {
      await createOk({ id: 600, label: 'Original' })

      const r = await entries.create({ id: 600, label: 'Duplicate' })
      expect(r.errors).toBeDefined()

      await removeQuiet(600)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. findAll and sorting
  // ---------------------------------------------------------------------------

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
