# runlify-spec-tests

Conformance test suite for validating runlify implementations across different languages.

## Purpose

This project contains specification tests that any runlify implementation must pass to be considered conformant. Tests are language-agnostic and verify behavior through CLI invocation and output validation.

## Prerequisites

Runlify must be installed globally:

```bash
npm i -g runlify
```

## Structure

```
runlify-spec-tests/
├── src/
│   └── runner/          # Test runner utilities for invoking implementations
├── tests/
│   ├── init/            # Tests for `runlify init` command
│   └── fixtures/        # Test fixtures and expected outputs
```

## Usage

```bash
# Install dependencies
pnpm install

# Run tests against default (original) implementation
pnpm test

# Run tests against specific implementation
RUNLIFY_IMPL=rust pnpm test
RUNLIFY_IMPL=go pnpm test
```

## Scripts

```bash
pnpm check       # Lint, typecheck, test
pnpm health      # Security and dependency checks
pnpm all-checks  # Run all checks
```

## Adding Tests

1. Create test fixtures in `tests/fixtures/`
2. Write spec tests in appropriate `tests/` subdirectory
3. Tests should invoke runlify CLI and validate outputs

## Implementations

Configure implementations in `src/runner/index.ts`:

- `typescript` - Original implementation (default)
- `rust` - Rust port (planned)
- `go` - Go port (planned)
