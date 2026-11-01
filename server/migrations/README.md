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

## Dry-run mode

Every migration honours `MIGRATE_DRY_RUN=1`: `up`/`down` only report what they WOULD
change and write nothing. Preview against a copy of production before applying:

```bash
MIGRATE_DRY_RUN=1 npm run migrate:up
```

## Pending reconciliation migrations (added 2026-11-01, NOT yet applied)

Introduced to back-fill the schema the transfer-paperwork/reliability work added.
They are safe-by-default — review the dry-run output and make the two decisions below
before a real `migrate:up`:

- `…010000-booking-active-unique-index` — partial unique index for one active booking
  per vehicle+documentType. **Never deletes data**: aborts and lists duplicates if any
  exist, so you resolve them by hand first.
- `…020000-slot-capacity-backfill` — `capacity=1`, `bookedCount` from `isBooked`.
- `…030000-provider-profile-completed-backfill` — **decision:** set
  `PROVIDER_PROFILE_COMPLETE_STRATEGY=all` or `approved-only` first, or it aborts.
- `…040000-reminder-transfer-fields` — marks existing reminders `kind='document'`.
- `…050000-document-expiring-soon-status` — `valid` docs within 30 days → `expiring_soon`.

Upcoming (Phase 3): a migration adding `verification: { source, checkedAt, referenceId }`
to `documents`, defaulting existing provider-verified docs to `source: "provider"`.
