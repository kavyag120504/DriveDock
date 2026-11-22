# RC verification (pluggable registry providers)

DriveDock can check an owner's registration number against a registry provider from the Vehicle Passport. The integration is disabled by default, runs only when the owner taps the button and consents, and needs no new dependency, seed or migration. The provider is chosen on the server with `RC_PROVIDER`; the controller, the app and the trust rules are the same for every provider. Arya was the first provider; the sections below that mention Arya's response describe the Arya adapter.

## Providers (status on 22 Nov 2026)

| `RC_PROVIDER` | Provider | Server env | Explicit RC expiry? | Status |
|---|---|---|---|---|
| `arya` (default) | Arya V1 Lite | `ARYA_API_TOKEN` | No: a match shows "RC record matched" | Token works but the account has 0 credits (the trial showed 0 complimentary hits) and RC Verification is no longer listed in Arya's India catalogue. Never completed a live lookup. |
| `stampmitra` | StampMitra Verify Vehicle RC (`POST /v1/verify/rc`) | `STAMPMITRA_API_KEY` (`sk_test_` sandbox, `sk_live_` production) | Yes (`rcExpiryDate`) | **Sandbox works end to end** (22 Nov: "TEST RESULT ONLY", document unchanged). Going live needs a KYC-approved organisation, an IP-allowlisted key (Render free has no fixed IP) and a wallet at about ₹9 per call. |
| `cashfree` | Cashfree Secure ID Vehicle RC | `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV` | Yes (`rc_expiry_date`) | Never run: account creation asks for a business PAN and a live website. Production also needs IP whitelisting or the `x-cf-signature` 2FA (`CASHFREE_PUBLIC_KEY_PATH`). |
| `idfy` | IDfy `ind_rc_plus` via RapidAPI | `RAPIDAPI_KEY`, `IDFY_RC_HOST` | No | The submit call is accepted (HTTP 202) but `GET /v3/tasks` answers "Endpoint does not exist" on both IDfy listings, so no result can be fetched. |
| `apiexpress` | API Express | `APIEXPRESS_API_KEY`, `APIEXPRESS_BASE_URL` | n/a | Their documented API host `api.apiexpress.in` does not resolve (NXDOMAIN). Keep only if they fix it. |

**Paid providers are blocked (23 Nov 2026).** The project has no credits or business account for Arya, Cashfree, IDfy or API Express, so `server/src/providers/registryCatalog.ts` marks them `paid` and the server refuses to use them unless `RC_ALLOW_PAID_PROVIDERS=true`. With the default (`false`), `POST /vehicles/:id/rc-verification` answers 503 `RC_PAID_PLAN_REQUIRED` before it reads anything or spends a call, and `GET` reports `access: 'paid'` and `paidPlanRequired: true` so the app can say so. Only the StampMitra sandbox (`sk_test_`) runs. Set the flag only once an account with credits exists.

Rules shared by every adapter (`server/src/providers/*Registry.ts`, shared error type and date parser in `aryaRegistry.ts`):
- Only allow-listed fields leave the adapter. Owner and father's name, addresses, mobile, chassis, engine, financer and policy numbers are never stored, logged or returned.
- One request per check (IDfy: one submit plus at most three result polls), a bounded timeout, no automatic retries, and a per-provider daily limit (`*_DAILY_LIMIT` env).
- Vendor error text is never passed to the client; errors map to fixed messages and codes (`RC_CREDITS_UNAVAILABLE`, `RC_PROVIDER_AUTH_FAILED`, `RC_PROVIDER_UNAVAILABLE`, ...).
- **Vendor test environments are sample data.** A provider whose `testMode` is true (StampMitra `sk_test_` key, Cashfree `CASHFREE_ENV=sandbox`) has its result stored with `testMode: true`, shown as "Sandbox test" and never changes the document's `verified`, dates, status or source. A cached sandbox result is not reused once the server is on live keys.
- A result can be `verified` only with an explicit RC validity date, so Arya and IDfy can never produce it; a live StampMitra or Cashfree lookup can.

### Try the StampMitra sandbox locally
1. Create a free account at developer.stampmitra.in, copy a `sk_test_` key that has the `verification.rc.read` scope.
2. In the git-ignored env file the server reads (`server/.env` or `server/.env.pilot`): `RC_VERIFICATION_ENABLED=true`, `RC_PROVIDER=stampmitra`, `STAMPMITRA_API_KEY=sk_test_...`.
3. Start the API, open a vehicle that has an uploaded RC, tap **Verify RC with StampMitra**. Expect a "Sandbox test" notice; the document stays unverified.
4. Tests for every provider use a mocked `fetch`, so `npx jest src/__tests__/stampmitraRegistry.test.ts` (and the cashfree, idfy, apiexpress, arya and rcVerification suites) need no network or key.

## Activation (Arya)

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

**Shortcut after an RC scan.** Scanning an RC photo on Add Vehicle only fills the form; it never contacts a registry. After the vehicle is saved, the app offers "Check this RC now?" only when a scan was used and this server can run a check (`enabled` on the GET above; false while paid providers are blocked). Choosing it opens the Vehicle Passport and starts the normal steps: the photo becomes an unverified RC document, the owner confirms its dates, and the usual consent screen appears. "Not now" adds nothing.

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
