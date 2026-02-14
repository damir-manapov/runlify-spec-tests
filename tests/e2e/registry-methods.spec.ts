import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type CrudClient, createCrudClient, gql } from './graphql-client.js'
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
  let prices: CrudClient<Price>

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
    prices = createCrudClient<Price>(ctx.server, 'Price', PRICE_FIELDS)
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
      const r = await gql<{ sliceOfTheLastPrice: Price }>(
        server,
        `query { sliceOfTheLastPrice(date: "2025-02-20") { ${PRICE_FIELDS} } }`,
      )
      expect(r.errors).toBeUndefined()
      // Most recent record on or before Feb 20 (any region): Feb 15 US or EU
      expect(r.data?.sliceOfTheLastPrice).toBeTruthy()
      expect(new Date(r.data!.sliceOfTheLastPrice.date).getTime())
        .toBeLessThanOrEqual(new Date('2025-02-20').getTime())
    })

    it('filters by region', async () => {
      const r = await gql<{ sliceOfTheLastPrice: Price }>(
        server,
        `query { sliceOfTheLastPrice(date: "2025-12-31", region: "US") { ${PRICE_FIELDS} } }`,
      )
      expect(r.errors).toBeUndefined()
      // Latest US record is Mar 20
      expect(r.data?.sliceOfTheLastPrice?.region).toBe('US')
      expect(r.data?.sliceOfTheLastPrice?.amount).toBe(120)
    })

    it('returns null when no records exist before date', async () => {
      const r = await gql<{ sliceOfTheLastPrice: Price | null }>(
        server,
        `query { sliceOfTheLastPrice(date: "2020-01-01") { ${PRICE_FIELDS} } }`,
      )
      expect(r.errors).toBeUndefined()
      expect(r.data?.sliceOfTheLastPrice).toBeNull()
    })
  })

  describe('sliceOfTheFirst', () => {
    it('returns the earliest record on or after a date', async () => {
      const r = await gql<{ sliceOfTheFirstPrice: Price }>(
        server,
        `query { sliceOfTheFirstPrice(date: "2025-02-01") { ${PRICE_FIELDS} } }`,
      )
      expect(r.errors).toBeUndefined()
      // Earliest record on or after Feb 1: Feb 15 (US or EU)
      expect(r.data?.sliceOfTheFirstPrice).toBeTruthy()
      expect(new Date(r.data!.sliceOfTheFirstPrice.date).getTime())
        .toBeGreaterThanOrEqual(new Date('2025-02-01').getTime())
    })

    it('filters by region', async () => {
      const r = await gql<{ sliceOfTheFirstPrice: Price }>(
        server,
        `query { sliceOfTheFirstPrice(date: "2025-01-01", region: "EU") { ${PRICE_FIELDS} } }`,
      )
      expect(r.errors).toBeUndefined()
      // First EU record on or after Jan 1: Jan 10
      expect(r.data?.sliceOfTheFirstPrice?.region).toBe('EU')
      expect(r.data?.sliceOfTheFirstPrice?.amount).toBe(200)
    })

    it('returns null when no records exist after date', async () => {
      const r = await gql<{ sliceOfTheFirstPrice: Price | null }>(
        server,
        `query { sliceOfTheFirstPrice(date: "2030-01-01") { ${PRICE_FIELDS} } }`,
      )
      expect(r.errors).toBeUndefined()
      expect(r.data?.sliceOfTheFirstPrice).toBeNull()
    })
  })
})

// ===========================================================================
// 2. SumRegistry: afterPost — exposed via custom GraphQL mutation
//    Overrides afterPost to create a side-effect record proving it fired
// ===========================================================================

interface Total {
  id: string
  region: string
  amount: number
}

const TOTAL_FIELDS = 'id region amount'

describe('e2e registry methods: afterPost (sumRegistry)', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let totals: CrudClient<Total>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-sum-registry')

    // Override afterPost in the generated AdditionalTotalsService (the designed customization point)
    writeBackFile(
      fresh,
      'src/adm/services/TotalsService/AdditionalTotalsService.ts',
      `
import {TotalsService} from './TotalsService';

export class AdditionalTotalsService extends TotalsService {
  override async afterPost(postOperations: any[]) {
    // Create a log record for each entry passed to afterPost
    for (const op of postOperations) {
      await this.ctx.prisma.total.create({
        data: {
          id: op.id + '-posted',
          region: op.region ?? 'posted',
          amount: op.amount ?? 0,
        },
      });
    }
  }
}
`,
    )

    // Expose afterPost via a custom GraphQL mutation
    writeBackFile(
      fresh,
      'src/adm/graph/services/totals/additionalTypeDefs.ts',
      `
import {gql} from 'apollo-server';

export default gql\`
  input PostTotalEntry {
    id: ID!
    region: String!
    amount: Float!
  }

  extend type Mutation {
    postTotals(entries: [PostTotalEntry!]!): Boolean
  }
\`;
`,
    )

    writeBackFile(
      fresh,
      'src/adm/graph/services/totals/additionalResolvers.ts',
      `
import {Context} from '../../../services/types';

interface PostTotalEntry {
  id: string;
  region: string;
  amount: number;
}

const queryResolvers = {
  Mutation: {
    postTotals: async (_: unknown, { entries }: { entries: PostTotalEntry[] }, { context }: { context: Context }) => {
      await context.service('totals').afterPost(entries);
      return true;
    },
  },
};

export default queryResolvers;
`,
    )

    const ctx = await compileAndStart(fresh, 'test_registry_after_post')
    server = ctx.server
    totals = createCrudClient<Total>(ctx.server, 'Total', TOTAL_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('afterPost creates side-effect records', async () => {
    const r = await gql<{ postTotals: boolean }>(
      server,
      `mutation {
        postTotals(entries: [
          { id: "ap-1", region: "US", amount: 500 },
          { id: "ap-2", region: "EU", amount: 300 }
        ])
      }`,
    )
    expect(r.errors).toBeUndefined()
    expect(r.data?.postTotals).toBe(true)
  })

  it('side-effect record for first entry exists', async () => {
    const r = await totals.findOne('ap-1-posted')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Total).toBeTruthy()
    expect(r.data?.Total?.region).toBe('US')
    expect(r.data?.Total?.amount).toBe(500)
  })

  it('side-effect record for second entry exists', async () => {
    const r = await totals.findOne('ap-2-posted')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Total).toBeTruthy()
    expect(r.data?.Total?.region).toBe('EU')
    expect(r.data?.Total?.amount).toBe(300)
  })

  it('afterPost with empty array is a no-op', async () => {
    const countBefore = await totals.count()
    const before = countBefore.data?._allTotalsMeta?.count ?? 0

    const r = await gql<{ postTotals: boolean }>(
      server,
      `mutation { postTotals(entries: []) }`,
    )
    expect(r.errors).toBeUndefined()
    expect(r.data?.postTotals).toBe(true)

    const countAfter = await totals.count()
    expect(countAfter.data?._allTotalsMeta?.count).toBe(before)
  })
})
