# RC verification through Arya

DriveDock supports Arya's V1 Lite RC lookup from the owner's Vehicle Passport. The integration is disabled by default. No new dependency, seed, database migration or automatic lookup is required.

## Activation

Configure these values in the **backend's secret environment settings**, then deploy/restart the backend when authorised:

```dotenv
RC_VERIFICATION_ENABLED=true
ARYA_API_TOKEN=<private Arya subscription token>
ARYA_RC_DAILY_LIMIT=50
```

Never put the token in Expo variables, mobile source, Git, screenshots or logs. Actual environment files have not been changed by this implementation. A new mobile build or updated Expo bundle is needed to include the RC screen. Restarting the existing backend also starts its usual cron jobs; review that separately before a live restart.

The daily limit counts outbound attempts per server process over a rolling 24-hour window, including failed attempts. It resets on process restart and is not a shared billing cap across instances. Arya subscription credits/pricing remain authoritative. Limit `0` blocks calls. Each authenticated owner/admin is also limited to 10 POST requests per hour, including cached checks.

## User flow

1. Log in as the vehicle owner, open Vehicle Passport and upload the RC if missing.
2. Select **Verify RC with Arya** and confirm consent to send that vehicle's registration number. The backend derives the number from the authorised vehicle, not the request body.
3. The backend makes one POST to `https://ping.arya.ai/api/v1/rc-verification` with the private `token` header and JSON `{ "rc_num": "...", "req_id": "..." }`. No automatic retries are made; the timeout is 15 seconds.
4. Read the result and its check time. A recent result for the same upload is reused for five minutes. Re-uploading or manually editing dates removes the previous registry proof.

`GET /api/v1/vehicles/:id/rc-verification` reads configuration availability and the last result without contacting Arya. `POST` to that endpoint requires authentication, owner/admin scope and `{ "consent": true }`. It requires an RC upload with a file hash. In-flight upload changes are rejected rather than certifying a replacement file.

## Results and compliance

| Result | Meaning | New document verification |
| --- | --- | --- |
| `verified` | Matching number, active/non-blacklisted record, valid registration date and explicit future RC-validity date | Granted; registry dates replace manually entered dates |
| `record_matched` | Matching active record, but explicit RC-validity dates are incomplete | Not granted |
| `expired` | Explicit RC expiry has passed | Removed |
| `inactive` | Inactive, suspended, blacklisted or scrapped registration | Removed |
| `not_found` | Provider explicitly reports no matching record | Removed |
| `unconfirmed` | Unrecognised status or unusable date evidence | Not granted; previous Arya verification removed |

The supplied V1 Lite response includes `registration_date`, `rc_status` and `fit_up_to`, but **no explicit RC expiry**. It therefore produces **RC record matched**, not full document verification. `fit_up_to` is retained only as fitness information by the adapter and is never substituted for RC expiry. Full verification accepts explicit `rc_valid_upto`, `rc_validity`, `rc_expiry_date` or `registration_valid_upto`; these fields must actually be supplied by the provider. Do not invent them or use owner-entered expiry as registry evidence.

An inconclusive registry result preserves existing approved-provider certification. Definitive negative evidence clears it. Provider completion replaces registry proof with provider certification; manually edited or replaced uploads become unverified again. Network/authentication/credit errors do not mutate the document or grant verification.

An RC lookup verifies registry records. It does **not** authenticate uploaded image content or prove the caller owns the vehicle. It does not verify a driving licence, insurance, PUC or fitness document. QR GREEN still requires all five existing required document records to be verified and unexpired. Owner, officer, buyer and Twin views distinguish Arya RC checks from provider certification.

## Stored data and validation

The adapter allowlists registration status, vehicle metadata and relevant validity dates. Raw responses, owner names, addresses, contact details, chassis/engine identifiers and policy numbers are neither persisted nor logged. The document stores only the registration, provider/request reference, outcome, check time, RC-validity date and upload hash. Successful checks add an audit entry and rebuild that document's pending expiry reminders if verification changes. No other document types are updated.

Automated tests use a mock HTTP transport and disposable MongoDB. They do not use real credentials, consume Arya credits or access the application database. Live success remains unverified until an authorised real registration is checked with a valid subscription token; use an owned/consented registration rather than a synthetic demo plate.

Official references: [Arya RC API](https://api.arya.ai/apex/rc-verification), [Arya FAQ](https://api.arya.ai/faqs).
