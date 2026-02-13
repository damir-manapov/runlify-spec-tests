#!/bin/bash
set -e

echo "=== Gitleaks ==="
gitleaks git --source . --verbose

echo "=== Outdated Dependencies ==="
pnpm outdated || {
  echo "Some dependencies are outdated"
  exit 1
}

echo "=== Audit ==="
pnpm audit

echo "=== Health checks passed ==="
