#!/usr/bin/env bash
# Session start: refresh agent context snapshot (orchestrator / portfolio).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -f "$ROOT/scripts/orchestrator-context.mjs" ]]; then
  node "$ROOT/scripts/orchestrator-context.mjs" 2>/dev/null || true
fi
exit 0
