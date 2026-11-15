#!/usr/bin/env bash
# Creates server/.env.pilot (git-ignored) with fresh random secrets for the student pilot API.
# Refuses to overwrite an existing file, so secrets (and the paperwork key) are never lost.
#
# The pilot runs with NODE_ENV=development on purpose: production mode refuses to start while
# payments/SMS/registry adapters are sandboxes, and that guard stays untouched. Instead every
# secret here is random, DEMO_MODE is off and Razorpay keeps its placeholder (test mode only).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.env.pilot
DB="${PILOT_DB:-drivedock_pilot_20261116}"
[[ "$DB" =~ ^drivedock_pilot_[0-9]{8}$ ]] || { echo "PILOT_DB must be drivedock_pilot_YYYYMMDD"; exit 1; }
if [ -e "$OUT" ]; then echo "$OUT already exists; not overwriting."; exit 1; fi
rnd() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
umask 077
cat > "$OUT" <<ENV
# DriveDock STUDENT PILOT API. Synthetic data only. Never commit this file.
NODE_ENV=development
PORT=5002
MONGO_URI=mongodb://127.0.0.1:27019/$DB
DEMO_MODE=false
TRUST_PROXY=1
CORS_ALLOWED_ORIGINS=
JWT_ACCESS_SECRET=$(rnd)
JWT_REFRESH_SECRET=$(rnd)
QR_SECRET=$(rnd)
INTERNAL_JOB_SECRET=$(rnd)
TRANSFER_SECRET=$(rnd)
TWIN_SHARE_SECRET=$(rnd)
PAPERWORK_ENCRYPTION_KEYS=pilot1:$(openssl rand -base64 32)
PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID=pilot1
# Login password for every seeded pilot account. Share it only in person.
SEED_PASSWORD=Pilot-$(openssl rand -hex 5)
ENV
echo "Wrote server/$OUT (mode 600). Database: $DB"
