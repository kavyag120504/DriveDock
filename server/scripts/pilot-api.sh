#!/usr/bin/env bash
# Starts the API with server/.env.pilot only (values set here win over server/.env).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.pilot ] || { echo "Run scripts/pilot-env.sh first"; exit 1; }
set -a; source .env.pilot; set +a
[[ "$MONGO_URI" =~ /drivedock_pilot_[0-9]{8}$ ]] || { echo "MONGO_URI is not a pilot database"; exit 1; }
exec npx ts-node --transpile-only src/index.ts
