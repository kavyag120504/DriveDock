# Transfer paperwork encryption — key operations runbook

Transfer-paperwork personal details (names, addresses, ID tails, chassis/engine
numbers, lender, policy number) are AES-256-GCM encrypted at rest via
`server/src/services/fieldCrypto.ts`. Losing the keys makes that data unreadable, so
treat key handling as a first-class operational concern.

## Credentials (secrets manager ONLY — never in the repo, env files, or logs)

Add these to the Phase 0 production secrets list alongside `JWT_*`, `QR_SECRET`, etc.:

| Name | What it is |
|---|---|
| `PAPERWORK_ENCRYPTION_KEYS` | Keyring: `keyId:base64Key,keyId2:base64Key2` — each key exactly 32 bytes. |
| `PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID` | Which key id new writes use. Must be present in the keyring. |

Production refuses to start without a valid keyring (`assertPaperworkKeyring()` in
startup, plus `PAPERWORK_ENCRYPTION_*` are required by `validateProductionSecrets()`).

## Generate a key

```bash
# 32 random bytes, base64 — pair with a short id, e.g. k2026a
node -e "console.log('k'+Date.now().toString(36)+':'+require('crypto').randomBytes(32).toString('base64'))"
```

## Backup

- Store the keyring in the secrets manager (AWS Secrets Manager / Vault), not in app
  config or CI logs. Keep an **offline, access-controlled backup** of every key id ever
  used — a record encrypted under a retired key is unreadable without it.
- Back up keys **separately** from database backups (a single compromised store must
  not yield both ciphertext and keys).

## Rotation (no downtime, no data rewrite required up front)

1. Generate a new key and append it to `PAPERWORK_ENCRYPTION_KEYS` (keep the old ones).
2. Set `PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID` to the new id and redeploy. New writes use
   the new key; old records still decrypt with the old keys in the keyring.
3. Re-encrypt existing records to the new key:
   ```bash
   npm run paperwork:reencrypt
   ```
4. Only after re-encryption AND after every database backup that used the old key has
   aged out (see retention below) may you drop the old key from the keyring.

## Loss / corruption recovery

- A decrypt failure (key missing from the keyring) surfaces as HTTP 503
  `PAPERWORK_UNAVAILABLE` and is logged as `decrypt_failed` in `PaperworkAudit` — it
  does not crash the server. Restore the missing key id from the offline backup and
  redeploy; no data change is needed.
- If a key is truly lost, affected personal details cannot be recovered. The transfer
  record and its audit trail remain; parties must re-enter their details.

## Backup retention (data-deletion caveat)

Personal details are deleted after `PAPERWORK_RETENTION_DAYS` (default 180) or on
request (`DELETE /twin/transfers/:id/paperwork/me`). Deletion uses `$unset`, so the
values can still exist in **database backups** until those backups expire. Align the
database backup retention window with `PAPERWORK_RETENTION_DAYS` (or shorter) so a
"deleted" record does not outlive its retention in backups. Document the actual backup
retention next to this file once the hosting/backup provider is chosen (Phase 0).
