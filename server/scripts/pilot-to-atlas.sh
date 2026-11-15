#!/usr/bin/env bash
# Copies the LOCAL pilot database (synthetic data) into the hosted pilot database on Atlas.
# Reads MONGO_URI from server/.env.render (never printed). Refuses unless the target database
# is named drivedock_pilot_YYYYMMDD. Replaces only the collections it restores, in that database.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.render; set +a
SRC_DB=drivedock_pilot_20261116
[[ "${MONGO_URI:-}" == mongodb+srv://* || "${MONGO_URI:-}" == mongodb://* ]] || { echo "Set MONGO_URI in .env.render"; exit 1; }
DST_DB=$(python3 -c 'import sys,urllib.parse as u;print(u.urlparse(sys.argv[1]).path.lstrip("/"))' "$MONGO_URI")
[[ "$DST_DB" =~ ^drivedock_pilot_[0-9]{8}$ ]] || { echo "REFUSED: target database must be drivedock_pilot_YYYYMMDD (got '$DST_DB')"; exit 1; }
[ "${1:-}" = "--confirm=$DST_DB" ] || { echo "Pass --confirm=$DST_DB to overwrite the hosted pilot data"; exit 1; }
DUMP=$(mktemp -d)
mongodump --quiet --uri "mongodb://127.0.0.1:27019/$SRC_DB" --out "$DUMP"
mongorestore --quiet --uri "$MONGO_URI" --drop --nsInclude "$SRC_DB.*" --nsFrom "$SRC_DB.*" --nsTo "$DST_DB.*" "$DUMP"
rm -rf "$DUMP"
echo "Copied $SRC_DB (local) -> $DST_DB (hosted)."
