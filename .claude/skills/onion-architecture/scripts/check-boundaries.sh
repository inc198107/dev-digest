#!/usr/bin/env bash
# Onion Architecture checks for server/ and reviewer-core/ (run from anywhere, Git Bash on Windows).
#
#   1. dependency rings   dependency-cruiser, rules in server/.dependency-cruiser.cjs
#   2. conventions        ast-grep, scripts/check-conventions.mjs
#   3. contract parity    the two copies of @devdigest/shared, scripts/check-shared-parity.mjs
#
# Known debt is recorded in server/.dependency-cruiser-known-violations.json,
# server/.onion-conventions-known.json and server/.shared-parity-known.json; only NEW
# violations fail. Pass --all to list known debt too. Exit code is non-zero on any failure.
set -u

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPTS/../../../.." && pwd)"
SERVER="$ROOT/server"

if [ ! -x "$SERVER/node_modules/.bin/depcruise" ]; then
  echo "onion-architecture: server dependencies are missing; run 'pnpm install' in server/ first." >&2
  exit 2
fi

KNOWN_DC="--ignore-known"
KNOWN_JS=""
if [ "${1:-}" = "--all" ]; then
  KNOWN_DC="--no-ignore-known"
  KNOWN_JS="--no-ignore-known"
fi

status=0

echo "── 1/3 dependency rings (dependency-cruiser)"
(cd "$SERVER" && ./node_modules/.bin/depcruise src ../reviewer-core/src ../reviewer-core/test \
  --config .dependency-cruiser.cjs $KNOWN_DC --output-type err-long) || status=1

echo "── 2/3 conventions (ast-grep)"
node "$SCRIPTS/check-conventions.mjs" $KNOWN_JS || status=1

echo "── 3/3 @devdigest/shared copies"
node "$SCRIPTS/check-shared-parity.mjs" $KNOWN_JS || status=1

if [ "$status" -ne 0 ]; then
  echo "✘ onion-architecture: fix the violations above (see .claude/skills/onion-architecture/references/enforcement.md)."
else
  echo "✔ onion-architecture: all checks passed."
fi
exit "$status"
