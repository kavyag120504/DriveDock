# Database migrations (migrate-mongo)

All schema changes go through ordered, reversible migrations — never ad-hoc edits.

```bash
cd server
npm run migrate:status     # show applied / pending migrations
npm run migrate:up         # apply all pending migrations
npm run migrate:down       # roll back the most recent migration
npm run migrate:create -- add-document-verification   # scaffold a new migration
```

- Target database is `MONGO_URI` (so dev/staging/prod each migrate their own DB).
- Migrations are TypeScript (`.ts`) and run via ts-node; export `up(db, client)` and `down(db, client)`.
- Every migration MUST implement a working `down`. Keep changes backward compatible:
  add fields/collections, backfill, then (in a later migration, after deploy) remove
  the old path. Never rename/drop in a single step.
- `20261101000000-baseline.ts` is the baseline for the pre-existing collections.

Upcoming (Phase 3): a migration adding `verification: { source, checkedAt, referenceId }`
to `documents`, defaulting existing provider-verified docs to `source: "provider"`.
