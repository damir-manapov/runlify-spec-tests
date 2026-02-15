/**
 * Abstraction layer for running the same e2e tests against
 * different backend implementations (TypeScript, Java, etc.).
 *
 * Each implementation provides a BackendUnderTest with start/stop methods.
 * The BACKEND env var selects which to use (default: 'java').
 */
import type { StartedServer } from './prepare-backend.js'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BackendUnderTest {
  readonly name: string

  /**
   * Start the backend for the given fixture and DB schema.
   * @param fixture - fixture directory name under tests/fixtures/
   * @param schema  - PostgreSQL schema for isolation
   */
  start(fixture: string, schema: string): Promise<StartedServer>

  /**
   * Stop a previously started server.
   */
  stop(server: StartedServer | undefined): Promise<void>
}

// ---------------------------------------------------------------------------
// Implementations (lazy-imported to avoid pulling in unnecessary deps)
// ---------------------------------------------------------------------------

function createJavaBackend(): BackendUnderTest {
  // Lazy import so we don't load Java deps when running TS tests
  let mod: typeof import('./prepare-java-backend.js') | undefined

  async function ensureMod() {
    if (!mod) mod = await import('./prepare-java-backend.js')
    return mod
  }

  return {
    name: 'java',
    async start(fixture, schema) {
      const m = await ensureMod()
      return m.startJavaServer(fixture, schema)
    },
    async stop(server) {
      const m = await ensureMod()
      return m.stopJavaServer(server)
    },
  }
}

function createTsBackend(): BackendUnderTest {
  let mod: typeof import('./prepare-backend.js') | undefined

  async function ensureMod() {
    if (!mod) mod = await import('./prepare-backend.js')
    return mod
  }

  // Keep track of the full SetupServerResult so we can clean up properly
  const ctxMap = new WeakMap<
    StartedServer,
    Awaited<ReturnType<typeof import('./prepare-backend.js').setupServer>>
  >()

  return {
    name: 'ts',
    async start(fixture, schema) {
      const m = await ensureMod()
      const ctx = await m.setupServer(fixture, schema)
      ctxMap.set(ctx.server, ctx)
      return ctx.server
    },
    async stop(server) {
      if (!server) return
      const m = await ensureMod()
      const ctx = ctxMap.get(server)
      if (ctx) {
        await m.teardownServer(ctx)
      } else {
        await m.stopServer(server)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Factory — select via BACKEND env var
// ---------------------------------------------------------------------------

const backends: Record<string, () => BackendUnderTest> = {
  java: createJavaBackend,
  ts: createTsBackend,
}

/**
 * Get the backend to test, controlled by the BACKEND env var.
 * Defaults to 'java'.
 */
export function getBackend(): BackendUnderTest {
  const key = (process.env.BACKEND ?? 'java').toLowerCase()
  const factory = backends[key]
  if (!factory) {
    throw new Error(`Unknown BACKEND="${key}". Available: ${Object.keys(backends).join(', ')}`)
  }
  return factory()
}
