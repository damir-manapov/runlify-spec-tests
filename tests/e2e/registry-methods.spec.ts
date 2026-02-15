import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPeriodicCrudClient, type PeriodicClient } from './graphql-client.js'
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
// 1. InfoRegistry: sliceOfTheLast / sliceOfTheFirst — exposed via custom
//    GraphQL queries on a periodic (day) info registry
// ===========================================================================

interface Price {
  id: string
  date: string
  region: string
  amount: number
}

const PRICE_FIELDS = 'id date region amount'

describe('e2e registry methods: sliceOfTheLast / sliceOfTheFirst (infoRegistry)', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let prices: PeriodicClient<Price>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-info-registry')

    // Expose sliceOfTheLast and sliceOfTheFirst via custom GraphQL queries
    writeBackFile(
      fresh,
      'src/adm/graph/services/prices/additionalTypeDefs.ts',
      `
import {gql} from 'apollo-server';

export default gql\`
  extend type Query {
    sliceOfTheLastPrice(date: Date, region: String): Price
    sliceOfTheFirstPrice(date: Date, region: String): Price
  }
\`;
`,
    )

    writeBackFile(
      fresh,
      'src/adm/graph/services/prices/additionalResolvers.ts',
      `
import {Context} from '../../../services/types';

interface SliceArgs {
  date?: string;
  region?: string;
}

const queryResolvers = {
  Query: {
    sliceOfTheLastPrice: async (_: unknown, { date, region }: SliceArgs, { context }: { context: Context }) => {
      const filter: Record<string, unknown> = {};
      if (region) filter.region = region;
      return context.service('prices').sliceOfTheLast(
        date ? new Date(date) : undefined,
        Object.keys(filter).length ? filter : undefined,
      );
    },
    sliceOfTheFirstPrice: async (_: unknown, { date, region }: SliceArgs, { context }: { context: Context }) => {
      const filter: Record<string, unknown> = {};
      if (region) filter.region = region;
      return context.service('prices').sliceOfTheFirst(
        date ? new Date(date) : undefined,
        Object.keys(filter).length ? filter : undefined,
      );
    },
  },
};

export default queryResolvers;
`,
    )

    const ctx = await compileAndStart(fresh, 'test_registry_slice')
    server = ctx.server
    prices = createPeriodicCrudClient<Price>(ctx.server, 'Price', PRICE_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  // Seed data: multiple dates × regions
  it('seeds price records across dates', async () => {
    const records = [
      { id: 's1', date: '2025-01-10', region: 'US', amount: 100 },
      { id: 's2', date: '2025-02-15', region: 'US', amount: 110 },
      { id: 's3', date: '2025-03-20', region: 'US', amount: 120 },
      { id: 's4', date: '2025-01-10', region: 'EU', amount: 200 },
      { id: 's5', date: '2025-02-15', region: 'EU', amount: 210 },
    ]
    for (const rec of records) {
      const r = await prices.create(rec)
      expect(r.errors).toBeUndefined()
    }
  })

  describe('sliceOfTheLast', () => {
    it('returns the most recent record on or before a date', async () => {
      const r = await prices.sliceOfTheLast({ date: '2025-02-20' })
      expect(r.errors).toBeUndefined()
      // Most recent record on or before Feb 20 (any region): Feb 15 US or EU
      const rec = r.data?.sliceOfTheLastPrice as Price
      expect(rec).toBeTruthy()
      expect(new Date(rec.date).getTime()).toBeLessThanOrEqual(new Date('2025-02-20').getTime())
    })

    it('filters by region', async () => {
      const r = await prices.sliceOfTheLast({ date: '2025-12-31', region: 'US' })
      expect(r.errors).toBeUndefined()
      // Latest US record is Mar 20
      expect(r.data?.sliceOfTheLastPrice?.region).toBe('US')
      expect(r.data?.sliceOfTheLastPrice?.amount).toBe(120)
    })

    it('returns null when no records exist before date', async () => {
      const r = await prices.sliceOfTheLast({ date: '2020-01-01' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.sliceOfTheLastPrice).toBeNull()
    })
  })

  describe('sliceOfTheFirst', () => {
    it('returns the earliest record on or after a date', async () => {
      const r = await prices.sliceOfTheFirst({ date: '2025-02-01' })
      expect(r.errors).toBeUndefined()
      // Earliest record on or after Feb 1: Feb 15 (US or EU)
      const rec = r.data?.sliceOfTheFirstPrice as Price
      expect(rec).toBeTruthy()
      expect(new Date(rec.date).getTime()).toBeGreaterThanOrEqual(new Date('2025-02-01').getTime())
    })

    it('filters by region', async () => {
      const r = await prices.sliceOfTheFirst({ date: '2025-01-01', region: 'EU' })
      expect(r.errors).toBeUndefined()
      // First EU record on or after Jan 1: Jan 10
      expect(r.data?.sliceOfTheFirstPrice?.region).toBe('EU')
      expect(r.data?.sliceOfTheFirstPrice?.amount).toBe(200)
    })

    it('returns null when no records exist after date', async () => {
      const r = await prices.sliceOfTheFirst({ date: '2030-01-01' })
      expect(r.errors).toBeUndefined()
      expect(r.data?.sliceOfTheFirstPrice).toBeNull()
    })
  })
})
