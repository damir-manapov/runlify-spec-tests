#!/bin/bash
set -e

echo "=== Formatting & Linting ==="
pnpm lint

echo "=== Type Check ==="
pnpm typecheck

echo "=== Tests ==="
pnpm test:run

echo "=== Java Build & Tests ==="
(cd java && gradle build test)

echo "=== All checks passed ==="
