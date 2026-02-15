#!/bin/bash
set -e

echo "=== Formatting & Linting ==="
pnpm lint

echo "=== Type Check ==="
pnpm typecheck

echo "=== Tests ==="
pnpm test:run

echo "=== Java Build ==="
(cd java && gradle build)

echo "=== All checks passed ==="
