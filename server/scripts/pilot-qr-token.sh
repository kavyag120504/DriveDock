#!/usr/bin/env bash
# Fallback for the browser demo: prints a fresh 2-minute QR token for one of the owner's
# vehicles, to paste into the officer's "Paste JWT token" box (shown only in dev/web builds).
# Reads SEED_PASSWORD from .env.pilot; never prints it.  Usage: scripts/pilot-qr-token.sh DL3CAB1234
set -euo pipefail
cd "$(dirname "$0")/.."
REG="${1:?usage: pilot-qr-token.sh <REGNUMBER>}"
set -a; source .env.pilot; set +a
API="${PILOT_API:-http://localhost:${PORT}/api/v1}"
python3 - "$API" "$REG" <<'PY'
import json, os, sys, urllib.request
api, reg = sys.argv[1], sys.argv[2]
def call(path, tok=None, body=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(api + path, data=json.dumps(body).encode() if body else None, headers=h)
    return json.load(urllib.request.urlopen(r, timeout=30))
tok = call('/auth/login', body={'email': 'owner@drivedock.com', 'password': os.environ['SEED_PASSWORD']})['data']['accessToken']
v = next((v for v in call('/vehicles', tok)['data'] if v['regNumber'] == reg), None)
if not v: sys.exit(f'{reg} is not one of owner@drivedock.com\'s vehicles')
print(call(f"/vehicles/{v['_id']}/qr-token", tok)['data']['token'])
PY
