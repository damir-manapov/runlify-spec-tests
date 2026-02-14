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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Product {
  id: string
  title: string
  price: number
}

const PRODUCT_FIELDS = 'id title price'

/**
 * Overwrite a generated hook file in the fresh backend with custom code.
 * Shorthand for writeBackFile with the ProductsService prefix.
 */
function writeHook(fresh: FreshBackend, hookFile: string, code: string): void {
  writeBackFile(fresh, `src/adm/services/ProductsService/${hookFile}`, code)
}

// ===========================================================================
// 1. beforeCreate — transform input data before DB write
// ===========================================================================

describe('e2e hooks: beforeCreate — uppercase title', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    writeHook(
      fresh,
      'hooks/beforeCreate.ts',
      `
import {Context} from '../../types';
import {
  ReliableProductCreateUserInput,
  StrictCreateProductArgs,
} from '../ProductsService';

export const beforeCreate = async (
  _ctx: Context,
  data: ReliableProductCreateUserInput,
): Promise<StrictCreateProductArgs> => {
  return {
    ...data,
    title: (data as any).title?.toUpperCase?.() ?? (data as any).title,
  };
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_before_create')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('beforeCreate hook uppercases the title on create', async () => {
    const r = await products.create({ id: 'bc-1', title: 'hello world', price: 10 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.createProduct?.title).toBe('HELLO WORLD')
  })

  it('stored value is also uppercased (read back)', async () => {
    const r = await products.findOne('bc-1')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product?.title).toBe('HELLO WORLD')
  })
})

// ===========================================================================
// 2. beforeUpdate — transform data before DB update
// ===========================================================================

describe('e2e hooks: beforeUpdate — prefix title', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    writeHook(
      fresh,
      'hooks/beforeUpdate.ts',
      `
import {StrictUpdateProductArgs} from '../ProductsService';
import {Context} from '../../types';

export const beforeUpdate = async (
  _ctx: Context,
  data: StrictUpdateProductArgs,
): Promise<StrictUpdateProductArgs> => {
  return {
    ...data,
    title: \`[edited] \${(data as any).title}\`,
  };
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_before_update')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('creates a product without transformation', async () => {
    const r = await products.create({ id: 'bu-1', title: 'Original', price: 5 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.createProduct?.title).toBe('Original')
  })

  it('beforeUpdate hook prefixes title on update', async () => {
    const r = await products.update({ id: 'bu-1', title: 'Changed', price: 5 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.updateProduct?.title).toBe('[edited] Changed')
  })

  it('stored value has the prefix (read back)', async () => {
    const r = await products.findOne('bu-1')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product?.title).toBe('[edited] Changed')
  })
})

// ===========================================================================
// 3. beforeDelete — reject deletion conditionally
// ===========================================================================

describe('e2e hooks: beforeDelete — block protected products', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    writeHook(
      fresh,
      'hooks/beforeDelete.ts',
      `
import {MutationRemoveProductArgs} from '../../../../generated/graphql';
import {Context} from '../../types';

export const beforeDelete = async (
  ctx: Context,
  params: MutationRemoveProductArgs,
): Promise<void> => {
  const entity = await ctx.service('products').get(params.id);
  if (entity && (entity as any).title?.startsWith('PROTECTED')) {
    throw new Error('Cannot delete protected products');
  }
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_before_delete')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('allows deleting a normal product', async () => {
    await products.create({ id: 'bd-1', title: 'Deletable', price: 1 })
    const r = await products.remove('bd-1')
    expect(r.errors).toBeUndefined()
  })

  it('blocks deleting a protected product', async () => {
    await products.create({ id: 'bd-2', title: 'PROTECTED item', price: 1 })
    const r = await products.remove('bd-2')
    expect(r.errors).toBeDefined()
    expect(r.errors?.[0]?.message).toContain('Cannot delete protected products')
  })

  it('protected product still exists after failed delete', async () => {
    const r = await products.findOne('bd-2')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product?.title).toBe('PROTECTED item')
  })
})

// ===========================================================================
// 4. changeListFilter — modify query filters
// ===========================================================================

describe('e2e hooks: changeListFilter — force minimum price', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    writeHook(
      fresh,
      'hooks/changeListFilter.ts',
      `
import {Context} from '../../types';
import {QueryAllProductsArgs} from '../../../../generated/graphql';

export const changeListFilter = async <T extends QueryAllProductsArgs = QueryAllProductsArgs>(
  _ctx: Context,
  args: T,
): Promise<T> => {
  // Force: only show products with price >= 100
  return {
    ...args,
    filter: {
      ...(args.filter || {}),
      price_gte: 100,
    },
  } as T;
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_change_list_filter')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('creates products with varying prices', async () => {
    for (const [id, title, price] of [
      ['clf-1', 'Cheap', 10],
      ['clf-2', 'Mid', 50],
      ['clf-3', 'Expensive', 200],
      ['clf-4', 'Premium', 500],
    ] as const) {
      const r = await products.create({ id, title, price })
      expect(r.errors).toBeUndefined()
    }
  })

  it('findAll only returns products with price >= 100', async () => {
    const r = await products.findAll()
    expect(r.errors).toBeUndefined()
    const items = r.data?.allProducts ?? []
    expect(items.length).toBe(2)
    expect(items.every((p) => p.price >= 100)).toBe(true)
  })

  it('meta count also respects the filter', async () => {
    const r = await products.count()
    expect(r.errors).toBeUndefined()
    expect(r.data?._allProductsMeta?.count).toBe(2)
  })

  it('get by id also applies the list filter (byUser=true)', async () => {
    // The changeListFilter hook applies to all user-facing queries,
    // including single-entity lookups — cheap products are filtered out
    const r = await products.findOne('clf-1')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product).toBeNull()
  })

  it('expensive product is visible via get by id', async () => {
    const r = await products.findOne('clf-3')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product?.title).toBe('Expensive')
    expect(r.data?.Product?.price).toBe(200)
  })
})

// ===========================================================================
// 5. afterCreate + afterUpdate + afterDelete — verify hooks fire with
//    observable side-effects (each hook creates a "log" product record)
// ===========================================================================

describe('e2e hooks: after* hooks — side-effect records', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    // afterCreate: create a side-effect product proving the hook fired
    writeHook(
      fresh,
      'hooks/afterCreate.ts',
      `
import {Product} from '../../../../generated/graphql';
import {Context} from '../../types';

export const afterCreate = async (
  ctx: Context,
  data: Product,
): Promise<void> => {
  await ctx.prisma.product.create({
    data: {
      id: data.id + '-after-create',
      title: 'created by afterCreate hook',
      price: 0,
      search: '',
    },
  });
};
`,
    )

    // afterUpdate: create a side-effect product proving the hook fired
    writeHook(
      fresh,
      'hooks/afterUpdate.ts',
      `
import {Product} from '../../../../generated/graphql';
import {Context} from '../../types';

export const afterUpdate = async (
  ctx: Context,
  data: Product,
): Promise<void> => {
  await ctx.prisma.product.create({
    data: {
      id: data.id + '-after-update',
      title: 'created by afterUpdate hook',
      price: 0,
      search: '',
    },
  });
};
`,
    )

    // afterDelete: create a side-effect product proving the hook fired
    writeHook(
      fresh,
      'hooks/afterDelete.ts',
      `
import {Product} from '../../../../generated/graphql';
import {Context} from '../../types';

export const afterDelete = async (
  ctx: Context,
  data: Product,
): Promise<void> => {
  await ctx.prisma.product.create({
    data: {
      id: data.id + '-after-delete',
      title: 'created by afterDelete hook',
      price: 0,
      search: '',
    },
  });
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_after_all')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('afterCreate fires — side-effect record is created', async () => {
    const r = await products.create({ id: 'ac-1', title: 'AfterTest', price: 42 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.createProduct?.id).toBe('ac-1')

    // The afterCreate hook should have created a companion record
    const log = await products.findOne('ac-1-after-create')
    expect(log.errors).toBeUndefined()
    expect(log.data?.Product?.title).toBe('created by afterCreate hook')
  })

  it('afterUpdate fires — side-effect record is created', async () => {
    const r = await products.update({ id: 'ac-1', title: 'AfterUpdated', price: 43 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.updateProduct?.title).toBe('AfterUpdated')

    // The afterUpdate hook should have created a companion record
    const log = await products.findOne('ac-1-after-update')
    expect(log.errors).toBeUndefined()
    expect(log.data?.Product?.title).toBe('created by afterUpdate hook')
  })

  it('afterDelete fires — side-effect record is created', async () => {
    const r = await products.remove('ac-1')
    expect(r.errors).toBeUndefined()

    // The afterDelete hook should have created a companion record
    const log = await products.findOne('ac-1-after-delete')
    expect(log.errors).toBeUndefined()
    expect(log.data?.Product?.title).toBe('created by afterDelete hook')
  })
})

// ===========================================================================
// 6. beforeUpsert — expose upsert via custom GraphQL mutation and verify
//    the hook transforms data on both create and update paths
// ===========================================================================

describe('e2e hooks: beforeUpsert — transforms data via custom upsert mutation', () => {
  let fresh: FreshBackend
  let server: StartedServer

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    // beforeUpsert: normalize whitespace in the title
    writeHook(
      fresh,
      'hooks/beforeUpsert.ts',
      `
import {Context} from '../../types';
import {
  StrictUpdateProductArgs,
  StrictCreateProductArgs,
  ReliableProductCreateUserInput,
} from '../ProductsService';

type InputData = {
  createData: ReliableProductCreateUserInput,
  updateData: StrictUpdateProductArgs,
};
type ReturnData = {
  createData: StrictCreateProductArgs,
  updateData: StrictUpdateProductArgs,
};

export const beforeUpsert = async (
  _ctx: Context,
  {createData, updateData}: InputData,
): Promise<ReturnData> => {
  const normalize = (s: string) => s.trim().replace(/\\s+/g, ' ');
  return {
    createData: {
      ...createData,
      title: normalize((createData as any).title ?? ''),
    },
    updateData: {
      ...updateData,
      title: normalize((updateData as any).title ?? ''),
    },
  };
};
`,
    )

    // Expose upsert via a custom GraphQL mutation
    writeBackFile(
      fresh,
      'src/adm/graph/services/products/additionalTypeDefs.ts',
      `
import {gql} from 'apollo-server';

export default gql\`
  extend type Mutation {
    upsertProduct(id: ID!, title: String!, price: Float!): Product
  }
\`;
`,
    )

    writeBackFile(
      fresh,
      'src/adm/graph/services/products/additionalResolvers.ts',
      `
import {Context} from '../../../services/types';

const queryResolvers = {
  Mutation: {
    upsertProduct: (_: unknown, params: {id: string; title: string; price: number}, {context}: {context: Context}) =>
      context.service('products').upsert(params, true),
  },
};

export default queryResolvers;
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_before_upsert')
    server = ctx.server
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('upsert create path — beforeUpsert normalizes whitespace', async () => {
    const r = await gql<{ upsertProduct: Product }>(
      server,
      `mutation { upsertProduct(id: "up-1", title: "  hello   world  ", price: 10) { ${PRODUCT_FIELDS} } }`,
    )
    expect(r.errors).toBeUndefined()
    expect(r.data?.upsertProduct?.id).toBe('up-1')
    expect(r.data?.upsertProduct?.title).toBe('hello world')
  })

  it('upsert update path — beforeUpsert normalizes whitespace', async () => {
    const r = await gql<{ upsertProduct: Product }>(
      server,
      `mutation { upsertProduct(id: "up-1", title: "  updated   title  ", price: 20) { ${PRODUCT_FIELDS} } }`,
    )
    expect(r.errors).toBeUndefined()
    expect(r.data?.upsertProduct?.id).toBe('up-1')
    expect(r.data?.upsertProduct?.title).toBe('updated title')
    expect(r.data?.upsertProduct?.price).toBe(20)
  })
})

// ===========================================================================
// 7. additionalOperationsOnCreate — extra transactional DB ops
// ===========================================================================

describe('e2e hooks: additionalOperationsOnCreate — auto-create companion record', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    // Use additionalOperationsOnCreate to create a second product in the same transaction
    writeHook(
      fresh,
      'hooks/additionalOperationsOnCreate.ts',
      `
import {MutationCreateProductArgs} from '../../../../generated/graphql';
import {Context} from '../../types';

export const additionalOperationsOnCreate = async (
  ctx: Context,
  data: MutationCreateProductArgs,
) => {
  // Create a companion "copy" record with '-copy' suffix
  const copyId = (data as any).id + '-copy';
  return [
    ctx.prisma.product.create({
      data: {
        id: copyId,
        title: (data as any).title + ' (copy)',
        price: (data as any).price,
        search: '',
      },
    }),
  ];
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_additional_ops_create')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('creating a product also creates a companion copy', async () => {
    const r = await products.create({ id: 'aoc-1', title: 'Original', price: 25 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.createProduct?.id).toBe('aoc-1')
  })

  it('companion record exists', async () => {
    const r = await products.findOne('aoc-1-copy')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product?.title).toBe('Original (copy)')
    expect(r.data?.Product?.price).toBe(25)
  })

  it('transaction rolls back both records on conflict', async () => {
    // Pre-create the would-be companion so the hook's create conflicts
    await products.create({ id: 'aoc-dup-copy', title: 'Blocker', price: 1 })

    // Now create 'aoc-dup' — the hook tries to create 'aoc-dup-copy' which already exists
    const r = await products.create({ id: 'aoc-dup', title: 'Should rollback', price: 50 })
    expect(r.errors).toBeDefined()

    // The main record should NOT exist either (transaction rolled back)
    const check = await products.findOne('aoc-dup')
    expect(check.data?.Product).toBeNull()
  })
})

// ===========================================================================
// 8. additionalOperationsOnUpdate — extra ops on update
// ===========================================================================

describe('e2e hooks: additionalOperationsOnUpdate — cascade price to copies', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    writeHook(
      fresh,
      'hooks/additionalOperationsOnUpdate.ts',
      `
import {MutationUpdateProductArgs} from '../../../../generated/graphql';
import {Context} from '../../types';

export const additionalOperationsOnUpdate = async (
  ctx: Context,
  data: MutationUpdateProductArgs,
) => {
  // When updating a product, also update the '-copy' record's price
  const copyId = (data as any).id + '-copy';
  const existing = await ctx.prisma.product.findFirst({where: {id: copyId}});
  if (existing) {
    return [
      ctx.prisma.product.update({
        where: {id: copyId},
        data: {price: (data as any).price},
      }),
    ];
  }
  return [];
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_additional_ops_update')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('setup: create a product and its copy', async () => {
    await products.create({ id: 'aou-1', title: 'Main', price: 100 })
    await products.create({ id: 'aou-1-copy', title: 'Main (copy)', price: 100 })
  })

  it('updating main product cascades price to copy', async () => {
    const r = await products.update({ id: 'aou-1', title: 'Main', price: 200 })
    expect(r.errors).toBeUndefined()
    expect(r.data?.updateProduct?.price).toBe(200)
  })

  it('copy record has updated price', async () => {
    const r = await products.findOne('aou-1-copy')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product?.price).toBe(200)
  })
})

// ===========================================================================
// 9. additionalOperationsOnDelete — extra ops on delete
// ===========================================================================

describe('e2e hooks: additionalOperationsOnDelete — cascade delete copies', () => {
  let fresh: FreshBackend
  let server: StartedServer
  let products: CrudClient<Product>

  beforeAll(async () => {
    fresh = await prepareBackendFresh('with-catalog')

    writeHook(
      fresh,
      'hooks/additionalOperationsOnDelete.ts',
      `
import {MutationRemoveProductArgs} from '../../../../generated/graphql';
import {Context} from '../../types';

export const additionalOperationsOnDelete = async (
  ctx: Context,
  data: MutationRemoveProductArgs,
) => {
  // When deleting a product, also delete the '-copy' record
  const copyId = (data as any).id + '-copy';
  const existing = await ctx.prisma.product.findFirst({where: {id: copyId}});
  if (existing) {
    return [
      ctx.prisma.product.delete({where: {id: copyId}}),
    ];
  }
  return [];
};
`,
    )

    const ctx = await compileAndStart(fresh, 'test_hook_additional_ops_delete')
    server = ctx.server
    products = createCrudClient<Product>(server, 'Product', PRODUCT_FIELDS)
  }, 240000)

  afterAll(async () => {
    await stopServer(server)
    cleanupFresh(fresh)
  })

  it('setup: create a product and its copy', async () => {
    await products.create({ id: 'aod-1', title: 'ToDel', price: 10 })
    await products.create({ id: 'aod-1-copy', title: 'ToDel (copy)', price: 10 })
  })

  it('deleting main product also deletes the copy', async () => {
    const r = await products.remove('aod-1')
    expect(r.errors).toBeUndefined()
  })

  it('copy record is also gone', async () => {
    const r = await products.findOne('aod-1-copy')
    expect(r.errors).toBeUndefined()
    expect(r.data?.Product).toBeNull()
  })
})
