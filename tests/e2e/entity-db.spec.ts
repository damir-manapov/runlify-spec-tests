import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupPrepared,
  type PreparedBackend,
  prepareBackend,
  runOrFail,
} from './prepare-backend.js'

const DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

/**
 * Run a small JS snippet inside the generated backend
 * using node, with PrismaClient pointing at the test DB.
 * Writes script to a temp file to avoid shell-escaping issues.
 * Returns the parsed JSON written to stdout.
 */
function prismaExec<T>(backDir: string, script: string): T {
  const scriptPath = path.join(backDir, '_test_script.cjs')
  fs.writeFileSync(scriptPath, script)
  try {
    const result = execSync(`node ${scriptPath}`, {
      cwd: backDir,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_MAIN_WRITE_URI: DATABASE_URL },
    })
    return JSON.parse(result.toString().trim()) as T
  } finally {
    fs.unlinkSync(scriptPath)
  }
}

describe('e2e: entity database CRUD', () => {
  let prepared: PreparedBackend

  beforeAll(async () => {
    prepared = await prepareBackend('with-catalog')

    // Push Prisma schema to the real DB (reset to clean state)
    runOrFail('prisma db push', 'npx prisma db push --force-reset --accept-data-loss', {
      cwd: prepared.backDir,
      timeout: 30000,
      env: { ...process.env, DATABASE_MAIN_WRITE_URI: DATABASE_URL },
    })
  }, 180000)

  afterAll(() => {
    cleanupPrepared(prepared)
  })

  it('creates a product in the database', () => {
    const product = prismaExec<{ id: string; title: string; price: number }>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const p = await prisma.product.create({
          data: { id: 'prod-1', title: 'Widget', price: 9.99 },
        });
        console.log(JSON.stringify(p));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(product.id).toBe('prod-1')
    expect(product.title).toBe('Widget')
    expect(product.price).toBe(9.99)
  })

  it('reads a product by id', () => {
    const product = prismaExec<{ id: string; title: string; price: number } | null>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const p = await prisma.product.findUnique({ where: { id: 'prod-1' } });
        console.log(JSON.stringify(p));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(product).not.toBeNull()
    expect(product?.title).toBe('Widget')
    expect(product?.price).toBe(9.99)
  })

  it('updates a product', () => {
    const updated = prismaExec<{ id: string; title: string; price: number }>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const p = await prisma.product.update({
          where: { id: 'prod-1' },
          data: { title: 'Super Widget', price: 19.99 },
        });
        console.log(JSON.stringify(p));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(updated.title).toBe('Super Widget')
    expect(updated.price).toBe(19.99)
  })

  it('lists all products', () => {
    // Create a second product first
    prismaExec(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        await prisma.product.create({
          data: { id: 'prod-2', title: 'Gadget', price: 29.99 },
        });
        console.log(JSON.stringify({ ok: true }));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    const products = prismaExec<Array<{ id: string; title: string }>>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const all = await prisma.product.findMany({ orderBy: { title: 'asc' } });
        console.log(JSON.stringify(all));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(products).toHaveLength(2)
    expect(products.at(0)?.title).toBe('Gadget')
    expect(products.at(1)?.title).toBe('Super Widget')
  })

  it('filters products by search field', () => {
    // Set search field on one product
    prismaExec(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        await prisma.product.update({
          where: { id: 'prod-1' },
          data: { search: 'super widget' },
        });
        console.log(JSON.stringify({ ok: true }));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    const filtered = prismaExec<Array<{ id: string }>>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const results = await prisma.product.findMany({
          where: { search: { contains: 'super' } },
        });
        console.log(JSON.stringify(results));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(filtered).toHaveLength(1)
    expect(filtered.at(0)?.id).toBe('prod-1')
  })

  it('counts products', () => {
    const result = prismaExec<{ count: number }>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const count = await prisma.product.count();
        console.log(JSON.stringify({ count }));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(result.count).toBe(2)
  })

  it('deletes a product', () => {
    const deleted = prismaExec<{ id: string }>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const p = await prisma.product.delete({ where: { id: 'prod-2' } });
        console.log(JSON.stringify(p));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(deleted.id).toBe('prod-2')

    const remaining = prismaExec<Array<{ id: string }>>(
      prepared.backDir,
      `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient({ datasourceUrl: ${JSON.stringify(DATABASE_URL)} });
      async function main() {
        const all = await prisma.product.findMany();
        console.log(JSON.stringify(all));
        await prisma.$disconnect();
      }
      main();
      `,
    )

    expect(remaining).toHaveLength(1)
    expect(remaining.at(0)?.id).toBe('prod-1')
  })
})
