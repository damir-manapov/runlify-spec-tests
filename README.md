# runlify-spec-tests

Conformance test suite for validating runlify implementations across different languages.

## Purpose

This project contains specification tests that any runlify implementation must pass to be considered conformant. Tests verify behavior through CLI invocation, output validation, and end-to-end testing against a running GraphQL backend.

## Prerequisites

Runlify must be installed globally:

```bash
npm i -g runlify
```

For e2e tests, a PostgreSQL instance is required:

```bash
pnpm compose:up   # Start Postgres via Docker
```

## Structure

```
runlify-spec-tests/
├── src/
│   └── runner/            # Test runner utilities for invoking implementations
├── tests/
│   ├── init/              # Tests for `runlify init` command
│   ├── regen/             # Tests for `runlify regen` command
│   ├── e2e/               # End-to-end tests against generated backend
│   │   ├── prepare-backend.ts         # Generate, scaffold, install, codegen
│   │   ├── compile-backend.spec.ts    # tsc, prisma validate, Dockerfile, Helm
│   │   ├── run-backend.spec.ts        # Server start, healthz, routing
│   │   ├── entity-graphql.spec.ts     # Generated file content checks
│   │   ├── entity-graphql-api.spec.ts # GraphQL CRUD against running Apollo
│   │   └── entity-db.spec.ts          # Direct Prisma DB operations
│   └── fixtures/
│       ├── scaffold/      # Common base: service classes, Apollo server, codegen
│       ├── minimal/       # Empty project (no entities)
│       └── with-catalog/  # Products entity for GraphQL e2e tests
├── compose/               # Docker Compose for e2e tests (Postgres)
├── all-checks.sh          # Run check + health
├── check.sh               # Lint, typecheck, tests
├── health.sh              # Gitleaks, audit, renovate-check
├── renovate-check.sh      # Local Renovate outdated check
├── renovate.json          # Renovate config for dependency updates
├── biome.json             # Linter & formatter config
├── tsconfig.json          # TypeScript config
├── vitest.config.ts       # Unit test config
├── vitest.e2e.config.ts   # E2e test config (sequential, single worker)
```

## Usage

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Run e2e tests (requires Postgres)
pnpm compose:up
pnpm test:e2e
```

## E2e test flow

`prepare-backend.ts` orchestrates each e2e test suite:

1. **Generate** — `runlify regen --back-only` with fixture metadata
2. **Scaffold** — overlay base classes from `minimal/scaffold/` (BaseService, Apollo server, context, config stubs)
3. **Force-overwrite** — replace specific generated files with test-compatible stubs (tracing, index, context, initEntities)
4. **Install** — `npm install` in the generated backend
5. **Prisma generate** — generate Prisma client
6. **Codegen** — `genGQSchemes.ts` runs `@graphql-codegen/core` to generate `graphql.ts` types from the GraphQL schema
7. **Start** — `tsx src/test-server.ts` launches Apollo Server Express on a random port

## Scripts

```bash
pnpm check       # Lint, typecheck, test
pnpm health      # Security and dependency checks
pnpm all-checks  # Run all checks

pnpm test        # Unit tests only
pnpm test:e2e    # E2e tests (Postgres required)

pnpm compose:pull     # Pull latest images
pnpm compose:up      # Start Postgres
pnpm compose:down    # Stop containers
pnpm compose:reset   # Stop and remove volumes
```

## Adding Tests

1. Create test fixtures in `tests/fixtures/` (metadata.json + options.json)
2. Write spec tests in `tests/e2e/` for backend behavior or `tests/regen/` for generation checks
3. E2e tests use `prepareBackend('fixture-name')` and `startServer()` from `prepare-backend.ts`

## Implementations

Configure implementations in `src/runner/index.ts`:

- `typescript` — Original implementation (default)
- `rust` — Rust port (planned)
- `go` — Go port (planned)
