/**
 * Shared e2e: ID type variants — manual int id + auto-generated string id (cuid).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getBackend } from '../backend-under-test.js'
import { type CrudClient, createCrudClient } from '../graphql-client.js'
import type { StartedServer } from '../prepare-backend.js'

const backend = getBackend()

// ---------------------------------------------------------------------------
// 1. Manual int id  (with-manual-int-id / Entry)
// ---------------------------------------------------------------------------

interface Entry {
  id: number
  label: string
}

describe(`shared e2e [${backend.name}]: manual int id (with-manual-int-id)`, () => {
  let server: StartedServer
  let entries: CrudClient<Entry>

  beforeAll(async () => {
    server = await backend.start('with-manual-int-id', `shared_mint_${backend.name}`)
    entries = createCrudClient<Entry>(server, 'Entry', 'id label', 'Entries')
  }, 240_000)

  afterAll(async () => {
    await backend.stop(server)
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

  describe('findOne non-existent', () => {
    it('returns null for non-existent int id', async () => {
      const r = await entries.findOne(999999)
      expect(r.errors).toBeUndefined()
      expect(r.data?.Entry).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Auto-generated string id / cuid  (with-auto-string-id / Ticket)
// ---------------------------------------------------------------------------

interface Ticket {
  id: string
  subject: string
}

describe(`shared e2e [${backend.name}]: auto string id / cuid (with-auto-string-id)`, () => {
  let server: StartedServer
  let tickets: CrudClient<Ticket>

  beforeAll(async () => {
    server = await backend.start('with-auto-string-id', `shared_cuid_${backend.name}`)
    tickets = createCrudClient<Ticket>(server, 'Ticket', 'id subject')
  }, 240_000)

  afterAll(async () => {
    await backend.stop(server)
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

    it('creates two tickets — ids are distinct', async () => {
      const a = await createOk({ subject: 'Issue A' })
      const b = await createOk({ subject: 'Issue B' })
      expect(a.id).not.toBe(b.id)
      await removeQuiet(a.id)
      await removeQuiet(b.id)
    })

    it('generated id is a non-empty string (> 10 chars)', async () => {
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
    it('create does not require id field', async () => {
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
