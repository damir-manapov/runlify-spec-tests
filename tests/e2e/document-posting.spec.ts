import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient } from './graphql-client.js'
import {
  cleanupFresh,
  compileAndStart,
  type FreshBackend,
  prepareBackendFresh,
  type StartedServer,
  stopServer,
  writeBackFile,
} from './prepare-backend.js'

// ===========================================================================
// Document → Registry posting lifecycle
//
// A document entity (`invoices`) is connected to a registrar-depended
// sum registry (`invoiceTotals`).  When a document is created / updated /
// deleted, the posting mechanism should automatically create / re-post /
// un-post registry entries.
//
// We inject a custom `getRegistryEntries` override into the generated
// AdditionalInvoicesService so that each invoice produces one registry
// entry with its region + amount.
// ===========================================================================

interface Invoice {
  id: string
  date: string
  code: string
  region: string
  amount: number
}

interface InvoiceTotal {
  id: string
  registrarTypeId: string
  registrarId: string
  row: number
  region: string
  amount: number
}

const INVOICE_FIELDS = 'id date code region amount'
const REGISTRY_FIELDS = 'id registrarTypeId registrarId row region amount'

describe('e2e document posting lifecycle (document → sum registry)', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let invoices: CrudClient<Invoice>
  let registry: CrudClient<InvoiceTotal>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-document-registry')

    // Inject getRegistryEntries override: each invoice produces one registry
    // entry carrying its region + amount.  registrarTypeId and registrarId
    // are added automatically by DocumentBaseService.getPostOperations.
    writeBackFile(
      fresh,
      'src/adm/services/InvoicesService/AdditionalInvoicesService.ts',
      `
import {InvoicesService} from './InvoicesService';

export class AdditionalInvoicesService extends InvoicesService {
  override getRegistryEntries = async (data: any): Promise<any> => ({
    invoiceTotal: [{
      region: data.region,
      amount: data.amount,
      row: 1,
    }],
  });
}
`,
    )

    const ctx = await compileAndStart(fresh, 'test_doc_posting')
    server = ctx.server
    invoices = createCrudClient<Invoice>(ctx.server, 'Invoice', INVOICE_FIELDS)
    registry = createCrudClient<InvoiceTotal>(ctx.server, 'InvoiceTotal', REGISTRY_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  // -----------------------------------------------------------------------
  // POST on create
  // -----------------------------------------------------------------------

  it('creating a document auto-creates registry entries', async () => {
    const created = await invoices.create({
      id: 'inv-1',
      date: new Date('2025-06-01T00:00:00Z').toISOString(),
      code: 'INV-001',
      region: 'US',
      amount: 100.5,
    })
    expect(created.errors).toBeUndefined()

    const entries = await registry.findAll({ filter: { registrarId: 'inv-1' } })
    expect(entries.errors).toBeUndefined()
    const list = Object.values(entries.data!)[0] as InvoiceTotal[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      registrarTypeId: 'invoice',
      registrarId: 'inv-1',
      row: 1,
      region: 'US',
      amount: 100.5,
    })
  })

  it('creating a second document adds separate entries', async () => {
    const created = await invoices.create({
      id: 'inv-2',
      date: new Date('2025-06-02T00:00:00Z').toISOString(),
      code: 'INV-002',
      region: 'EU',
      amount: 200,
    })
    expect(created.errors).toBeUndefined()

    // Verify inv-2 entries
    const entries2 = await registry.findAll({ filter: { registrarId: 'inv-2' } })
    const list2 = Object.values(entries2.data!)[0] as InvoiceTotal[]
    expect(list2).toHaveLength(1)
    expect(list2[0]).toMatchObject({ region: 'EU', amount: 200 })

    // Verify inv-1 entries still intact
    const entries1 = await registry.findAll({ filter: { registrarId: 'inv-1' } })
    const list1 = Object.values(entries1.data!)[0] as InvoiceTotal[]
    expect(list1).toHaveLength(1)
    expect(list1[0]).toMatchObject({ region: 'US', amount: 100.5 })
  })

  // -----------------------------------------------------------------------
  // RE-POST on update
  // -----------------------------------------------------------------------

  it('updating a document re-posts its registry entries', async () => {
    const updated = await invoices.update({
      id: 'inv-1',
      date: new Date('2025-06-01T00:00:00Z').toISOString(),
      code: 'INV-001',
      amount: 999,
      region: 'CA',
    })
    expect(updated.errors).toBeUndefined()

    const entries = await registry.findAll({ filter: { registrarId: 'inv-1' } })
    expect(entries.errors).toBeUndefined()
    const list = Object.values(entries.data!)[0] as InvoiceTotal[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      registrarTypeId: 'invoice',
      registrarId: 'inv-1',
      region: 'CA',
      amount: 999,
    })
  })

  it("re-post does not affect other documents' entries", async () => {
    const entries = await registry.findAll({ filter: { registrarId: 'inv-2' } })
    const list = Object.values(entries.data!)[0] as InvoiceTotal[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ region: 'EU', amount: 200 })
  })

  // -----------------------------------------------------------------------
  // UN-POST on delete
  // -----------------------------------------------------------------------

  it('deleting a document removes its registry entries', async () => {
    const removed = await invoices.remove('inv-1')
    expect(removed.errors).toBeUndefined()

    const entries = await registry.findAll({ filter: { registrarId: 'inv-1' } })
    expect(entries.errors).toBeUndefined()
    const list = Object.values(entries.data!)[0] as InvoiceTotal[]
    expect(list).toHaveLength(0)
  })

  it("delete does not affect other documents' entries", async () => {
    const entries = await registry.findAll({ filter: { registrarId: 'inv-2' } })
    const list = Object.values(entries.data!)[0] as InvoiceTotal[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ region: 'EU', amount: 200 })
  })
})
