# DriveDock — CLAUDE.md

Read this first. It is the shared, current picture of the project for both teammates and for Claude Code sessions. Update it in the same PR whenever you change how the project runs or what it guarantees.

Last updated: 2026-10-18 (Phase 2–6 code complete; all remaining items need external accounts or manual testing)

## What DriveDock is

A multi-role vehicle compliance platform. Other apps store photos of vehicle papers; DriveDock proves they are genuine.

| Real-world problem | DriveDock's idea |
|---|---|
| Papers (RC, insurance, PUC, licence, fitness) are scattered | One "Vehicle Passport" per vehicle |
| A photo of a document can be faked | A document is verified only when an approved provider issues it after a paid, completed service |
| Officers can't check genuineness on the spot | Owner shows a QR code; officer scans it and gets GREEN or RED with reasons |
| A QR screenshot could be reused | QR is a signed token that expires after 2 minutes |
| Anyone could pose as a testing centre | Providers must be approved by an admin |
| Owners miss renewal dates | Reminders at 30, 7 and 1 day before expiry |
| Renewing means queuing | Find approved stations nearby, book a slot, pay in the app |
| Paper fines are hard to track | Officer logs a violation and a digital e-challan is issued |
| Authorities lack a live picture | Government dashboard: compliance rate, regions, document trends |

Five roles: **owner, provider, officer, government, admin**.

## Repo layout

```
mobile/   Expo (React Native) app, all five roles
server/   Node.js + Express + TypeScript + MongoDB (Mongoose) API
.sf/      Salesforce tooling metadata, not part of the app (a local tool keeps rewriting
          catalog.json; don't commit changes to it)
```

## Tech stack

| Layer | Choice |
|---|---|
| Mobile | Expo **SDK 57** (React 19.2, React Native 0.86), managed workflow |
| Navigation | React Navigation (stack + bottom tabs, picked by role in `RootNavigator.tsx`) |
| State | Zustand (auth), TanStack Query (server data) |
| Backend | Express + TypeScript, run with ts-node-dev |
| Database | MongoDB via Mongoose |
| Auth | JWT access token (15 min) + refresh token (7 days); expo-secure-store on device, localStorage on web |
| Uploads | Local `server/uploads/` (AWS S3 if AWS keys are set) |
| Payments | Razorpay test flow with server-side HMAC verification (see "Known gaps") |
| Push | expo-notifications + Expo Push API |
| Maps | react-native-maps on phones; a placeholder on web (`src/components/Map.web.tsx`) |
| QR | react-native-qrcode-svg to show, expo-camera to scan |

## Running it locally

### 1. Database

`npm run seed` **deletes every collection** before seeding. Don't point it at a database you care about. Use a throwaway one, for example:

```bash
mkdir -p /tmp/drivedock-db && mongod --dbpath /tmp/drivedock-db --port 27018
```

### 2. Server

Create `server/.env` (git-ignored):

```
MONGO_URI=mongodb://127.0.0.1:27018/drivedock
PORT=5001
DEMO_MODE=true   # optional: enables the station picker on the demo login (never set on a hosted server)
```

Use a port other than 5000 on a Mac: macOS AirPlay Receiver already listens on 5000 and the server fails with `EADDRINUSE`.

```bash
cd server
npm install
npm run seed     # wipes and re-seeds demo data
npm run seed:demo # or: wipes and loads the NCR sample dataset (synthetic, ~250 vehicles)
npm run dev      # http://localhost:5001/api/health should return 200
```

Every other setting in `server/src/config/env.ts` has a built-in development default (see "Known gaps").

### 3. Mobile

No configuration needed. In development the app calls the API on the same computer that serves the app, using the address Expo gives the phone (port 5001, or `EXPO_PUBLIC_API_PORT`). After changing Wi-Fi, just restart Expo and rescan the QR code.

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` (git-ignored) only to force a specific API, for example the hosted one; it always takes priority.

```bash
cd mobile
npm install
npx expo start --clear
```

- **Phone:** install Expo Go (it must support SDK 57), connect to the same Wi-Fi, scan the QR code.
- **Browser:** press `w`, or open http://localhost:8081. Maps show a placeholder and the camera may not work.
- **Push notifications do not arrive in Expo Go on Android** (removed in SDK 53). They need the APK build below.

### 4. Demo accounts (after `npm run seed`, all passwords `password123`)

| Role | Email |
|---|---|
| Owner | owner@drivedock.com |
| Provider (approved) | provider@drivedock.com |
| Provider (pending, hidden from search) | pending.provider@drivedock.com |
| Officer | officer@drivedock.com |
| Government | gov@drivedock.com |
| Admin | admin@drivedock.com |

The login screen also has one-tap demo buttons per role (development builds only). With `DEMO_MODE=true` on the server, the "Approved Provider" button opens a list of every station, so you can log in as the station a customer just booked and show the booking arriving on its "Inspection Orders" screen (`GET /api/v1/demo/stations`, which returns 404 when `DEMO_MODE` is off).

Seeded vehicles: `MH01AB1234` scans GREEN, `MH02CD5678` scans RED, and `MH04EF9012` has a PUC expiring in 5 days with a due reminder.


**NCR sample dataset (`npm run seed:demo`).** Synthetic data for presentations: 156 owners, 250 vehicles across Delhi, Gurugram, Faridabad, Sonipat, Noida, Ghaziabad, Meerut and Alwar, 9 approved stations plus 1 pending (fictional names in real localities), about six months of bookings, payments, violations, e-challans and reminders. Same logins as above, plus `officer2@drivedock.demo`, `officer3@drivedock.demo` and `station2…9@drivedock.demo`. Walkthrough vehicles for `owner@drivedock.com`: `DL3CAB1234` GREEN, `DL8CAF5678` RED, `HR26DK9012` GREEN with PUC expiring in 5 days. Everything is generated and the proportions are illustrative (see the header of `server/scripts/seed-demo.ts`); always present it as sample data.

## Trust rules the server enforces

These are the product's core promise. Don't weaken them without discussing it with the team.

1. **Only a completed service verifies a document.** `verified: true` is set only when a provider completes a booking, and only if all of these hold:
   - the booking is `confirmed` (payment verified);
   - the provider is `approved` at that moment;
   - a certificate file is uploaded. Its real SHA-256 is stored as `fileHash`.

   An owner's upload or manual edit always leaves or resets `verified: false`. Providers cannot set `confirmed` themselves; the status endpoint accepts only `completed` or `cancelled`.
2. **GREEN means all five documents exist, are valid, not expired, and verified.** Anything else is RED with reasons.
3. **Rotating QR.** `GET /vehicles/:id/qr-token` returns a JWT signed with `QR_SECRET` that expires in 120 s. `GET /public/verify?token=` checks it; a forged or edited token returns 401.
4. **Atomic slot booking.** `Slot.findOneAndUpdate({ _id, isBooked: false }, { isBooked: true })`. If nothing matches, the slot was taken and the API returns 409.
   - **One active booking per vehicle and document.** While a vehicle has a `pending` or `confirmed` booking for a document type, another booking for the same document (at any station) returns 409 `ACTIVE_BOOKING_EXISTS` with the existing booking. A partial unique index on bookings (`one_active_booking_per_vehicle_document`) enforces it even for simultaneous requests. Only slots dated today or later can be booked.
   - **Renewal window.** A document that is provider-verified and unexpired can only be booked within 30 days of its expiry (`RENEWAL_WINDOW_DAYS` in `services/complianceService.ts`); earlier attempts return 409 `RENEWAL_NOT_DUE` with the date renewal opens. Missing, unverified (owner-uploaded) or expired documents can always be booked.
5. **Provider approval gate.** Only `approved` providers appear in search, take bookings or complete them. Admin sets status via `PATCH /admin/providers/:id/status`.
6. **Payments.**
   - The server sets the amount from the booking's document type (`SERVICE_FEES_INR` in `paymentService.ts`: PUC 250, insurance 2400, others 1000) and ignores any amount from the client.
   - The signature is an HMAC-SHA256 of `orderId|paymentId`; a bad or wrong-length signature returns 400.
   - A payment can only confirm the booking its order was created for.
   - Only a `pending` booking can get an order or be confirmed. Bookings left unpaid for 30 minutes are cancelled with `cancellationReason: 'payment_timeout'` and their slot freed. A payment verified after that reinstates the booking only if the slot can be reclaimed; otherwise it returns 409 and the payment stays `paid` for a refund.
7. **Ownership on every record.** Shared helpers live in `server/src/services/accessService.ts`.
   - An owner reaches only their own vehicles, documents, bookings, payments, reminders and challans.
   - A provider reaches only bookings assigned to them. Admin reaches everything.
   - Vehicle-keyed lookups return 404 when not allowed; booking- and payment-keyed lookups return 403.
   - Officer and government accounts currently get empty vehicle and booking lists.
8. **Roles.** Public signup accepts only `owner` or `provider`; any other role returns 400. Officer, government and admin accounts are created by an admin with `POST /api/v1/admin/users`. The seed script creates its demo accounts directly.
9. **Reminders are "due and not sent".** The job processes `scheduledFor <= now AND sent: false`, so it catches up after downtime. It runs daily at 00:00 (node-cron), and `POST /reminders/trigger-job` with header `x-internal-job-secret` runs it on demand.

## API notes

- Base path `/api/v1`. Everything needs `Authorization: Bearer <token>` except `/auth/signup`, `/auth/login`, `/auth/refresh`, `/public/verify` and `/reminders/trigger-job` (internal secret instead).
- Violations live at both `/api/v1/violations` (the path the app uses) and `/api/v1/officer/violations`.
- `POST /auth/logout` clears the user's push token.

## Building the APK

Fill these placeholders first:

1. **Google Maps key:** replace `YOUR_GOOGLE_MAPS_API_KEY` in `mobile/app.json` (Google Cloud → Maps SDK for Android). Maps show grey tiles without it.
2. **EAS project:** run `npx eas login` and then `npx eas project:init` in `mobile/`. This fills `YOUR_EAS_PROJECT_ID` in `app.json`, which push tokens need.

Then build:

```bash
cd mobile
npx eas build --platform android --profile preview   # installable .apk
```

Remember the APK talks to whatever `EXPO_PUBLIC_API_URL` was at build time.

## Known gaps (not fixed yet)

- **Payments can be self-confirmed.** `create-order` returns `testSignatureHelper`, a valid signature the app sends straight back, so "confirmed" doesn't yet mean money moved. Razorpay is never really called: test keys are placeholders and the server falls back to a made-up order id. Real checkout is a planned task.
- **Default secrets are in source.** `server/src/config/env.ts` has fallback JWT, QR, job and Razorpay secrets; anyone with the repo can forge tokens unless `.env` overrides them. Set real values before any deployment.
- ~~**`PATCH /vehicles/:id` writes the request body straight to the record**~~ — fixed: only type, make, model, year, fuelType, region are accepted.
- ~~**Slots are never released** when a booking is cancelled or left unpaid~~ — fixed: cancellation releases the slot immediately; a cron every 5 min cancels bookings unpaid for >30 min.
- **Challans:** `PATCH /challans/:id/pay` marks a challan paid without any payment.
- ~~**Officers can send any `penaltyAmount`**~~ — fixed: server always computes penalty from PENALTY_MAP; client input ignored.
- ~~**Public exposure:** `/public/verify` returns the owner's phone~~ — fixed: phone removed from public response.
- ~~**Expiry date:** a provider can set any `expiryDate`~~ — fixed: server rejects past dates and dates > 10 years out.
- ~~**Reminders:** the job marks a reminder sent even when the owner has no push token~~ — fixed: skips silently, retries next run.
- **Officer and government roles** may need read access to vehicles. That's a product decision.
- ~~**Encoding:** some mobile source files saved as Windows-1252~~ — fixed: `LoginScreen.tsx`, `ScanQRScreen.tsx`, `StationMapScreen.tsx` converted to UTF-8; garbled chars replaced.

## Roadmap: from demo to live

Goal: real people sign up, add real vehicles and documents, pay real money, and get real results, with nothing faked or hard-coded. Work the phases in order; each one depends on the one before. Tick items off in this file as they land.

### What's still demo today

| Where | What's fake or fixed |
|---|---|
| ~~`LoginScreen.tsx`, `authStore.ts`~~ | ~~"PITCH DEMO" text, one-tap role switcher~~ — fixed: both behind `__DEV__`; hidden in production builds |
| `BookSlotScreen.tsx` | Payment "completed" by sending back the server's `testSignatureHelper` with a made-up `pay_rzp_…` id |
| `paymentService.ts` | Placeholder Razorpay keys; falls back to a made-up order id |
| `OwnerChallansScreen.tsx`, `challanController.ts` | "Pay" marks the challan paid with no real payment |
| ~~`VehicleDetailScreen.tsx`~~ | ~~Images only, no PDF or camera~~ — fixed: date modal + gallery/camera/PDF |
| ~~`CompleteBookingScreen.tsx`~~ | ~~Expiry always +1 year; images only~~ — fixed: provider enters dates; gallery/camera/PDF |
| ~~`ManageSlotsScreen.tsx`~~ | ~~Five fixed slots for today~~ — fixed: date input + Morning/Afternoon/Full Day templates |
| ~~`StationMapScreen.tsx`~~ | ~~Silent Mumbai fallback~~ — fixed: real GPS; city-name modal when permission denied |
| ~~`ScanQRScreen.tsx`~~ | ~~Manual paste JWT box always visible~~ — fixed: hidden behind `__DEV__` |
| ~~`LogViolationScreen.tsx`~~ | ~~Officer types any penalty~~ — fixed: server fee table; shown read-only |
| Server | Seeded data, default secrets in source, local-disk uploads, only runs on a laptop |

### Phase 0: accounts and infrastructure (blocks everything else)

| Need | Why | Who sets it up |
|---|---|---|
| Hosted API with HTTPS (e.g. Render, Railway or Fly.io) | Phones outside your Wi-Fi can't reach a laptop | Team |
| MongoDB Atlas cluster (production DB, never seeded) | Real data that survives restarts | Team |
| Real secrets in the host's env (`JWT_*`, `QR_SECRET`, `INTERNAL_JOB_SECRET`) | Defaults in source let anyone forge tokens | Team |
| `TRUST_PROXY=1` in the host's env (number of proxies in front of the API) | The login/signup rate limit uses the real client IP only when Express knows how many proxy hops to trust | Team |
| AWS S3 bucket (private) or similar | Uploads on local disk vanish on redeploy and are public | Team |
| Razorpay account: test keys now, live keys after KYC | Real payments | Account owner |
| Google Maps API key (Maps SDK for Android/iOS) | Map tiles in builds | Account owner |
| EAS project (`npx eas project:init`) and Expo account | Development builds, APKs and push tokens | Account owner |

Exit check: `GET https://<api-host>/api/health` returns 200 from a phone on mobile data, and the app's `EXPO_PUBLIC_API_URL` points at it.

### Phase 1: switch from Expo Go to a development build

Razorpay's native checkout, push notifications on Android and Google Maps don't work in Expo Go. Make a development build once (`npx eas build --profile development`), install it on the test phones, and use it instead of Expo Go from here on. Expo Go can stay for quick UI-only checks.

### Phase 2: real accounts

- [x] Hide the demo role switcher and "PITCH DEMO" text behind `__DEV__`.
- [x] Bootstrap script that creates the first admin on the production DB from env values. Don't run the seed there.
- [x] Admin screen to create officer and government accounts (the API `POST /admin/users` exists; there's no screen yet).
- [ ] Provider sign-up → pending → admin approves — API and screens exist; requires end-to-end test on real devices after Phase 0 hosting is live.
- [x] Password rules on signup: min 8 chars, must have a letter and a number.
- [ ] "Forgot password" needs an email or SMS provider (decide which).

### Phase 3: owner screens use real input

- [x] Add vehicle: validate Indian registration-number format (e.g. MH01AB1234); show server errors for duplicates.
- [x] Document upload: owner picks issue and expiry dates via a modal before selecting the photo.
- [x] Document upload: allow camera and PDFs in addition to gallery photos.
- [x] Stations: real GPS; if permission is denied, ask the user for a city name instead of silently using Mumbai.
- [x] Booking: date filter on slots; price shown from server response (not hardcoded in app).

### Phase 4: real payments (bookings and challans)

- [ ] Server: create real Razorpay orders with real keys; remove `testSignatureHelper`.
- [ ] App: open Razorpay checkout (`react-native-razorpay` in the development build) and send the real `razorpay_payment_id` and signature to `/payments/verify`.
- [ ] Server: add a Razorpay webhook (`payment.captured`), verified with the webhook secret, so a booking confirms even if the app closes mid-payment.
- [x] Release a slot when its booking is cancelled or stays unpaid for N minutes.
- [ ] Challans: pay through the same Razorpay flow; remove the "mark paid" shortcut.
- [x] Penalty amounts come from the server's fee table, not typed by the officer.

### Phase 5: provider and officer screens

- [x] Provider slots: date input + time template picker (Morning / Afternoon / Full Day) instead of five fixed slots for today.
- [x] Complete booking: certificate now required client-side; provider enters issue and expiry dates; server rejects past or > 10-year expiry.
- [x] Complete booking: allow camera and PDF in addition to gallery photos.
- [x] Officer: manual token paste box hidden behind `__DEV__`; camera-only in production builds.

### Phase 6: notifications, storage and privacy

- [x] Push reminders: job only marks sent when Expo Push accepts; skips silently when no push token (retries next run).
- [ ] Uploads go to private S3; the app gets short-lived signed URLs.
- [x] `/public/verify` no longer returns owner phone number.
- [x] Rate-limit login and signup: 10 attempts per IP per 15 minutes (in-memory limiter, no extra package). Keyed on `req.ip`, so set `TRUST_PROXY` when hosted behind a proxy; client-sent `X-Forwarded-For` values are ignored otherwise.
- [x] `PATCH /vehicles/:id` restricted to type, make, model, year, fuelType, region — ownerId, regNumber, qrCodeId are blocked.

### Phase 7: release

- [ ] Preview APK from the hosted API (`npx eas build --platform android --profile preview`).
- [ ] End-to-end test on two phones: owner signs up → adds vehicle → books and pays → provider completes with a certificate → officer scans → GREEN.
- [ ] Switch Razorpay to live keys only after the full flow passes in test mode.

### Decisions the team needs to make

- Hosting provider for the API (affects cost and cold starts).
- Whether the demo login stays available in the APK for evaluators (behind a hidden switch) or goes completely.
- Fee table (currently PUC 250, insurance 2400, others 1000) and challan penalties.
- Email or SMS provider for password reset and notifications, if wanted.

## Out of scope

- EV charging module (`fuelType: "ev"` exists in the schema only).
- Real VAHAN integration; the government dashboard uses seeded or aggregated data.
- `expo-barcode-scanner` is removed from recent SDKs; use expo-camera's barcode scanning.

## Key files

| File | Purpose |
|---|---|
| `server/src/services/accessService.ts` | Ownership rule helpers (`ownerScope`, `isOwnerOrAdmin`, `canAccessBooking`) |
| `server/src/controllers/bookingController.ts` | Atomic booking and completion rules (sets `verified: true`) |
| `server/src/controllers/paymentController.ts`, `services/paymentService.ts` | Server-side amount, HMAC verification |
| `server/src/controllers/verificationController.ts`, `services/qrService.ts` | GREEN/RED check, rotating QR tokens |
| `server/src/controllers/authController.ts`, `adminController.ts` | Signup role limits, logout, admin staff creation |
| `server/src/routes/index.ts`, `routes/officerRoutes.ts` | Route mounting, including violations |
| `server/src/controllers/reminderController.ts`, `cron/reminderCron.ts` | Reminder job |
| `server/scripts/seed.ts` | Demo data (wipes the database first) |
| `server/scripts/bootstrap-admin.ts` | Creates the first admin on a production DB from env vars (`ADMIN_NAME/EMAIL/PHONE/PASSWORD`); run once, safe to re-run |
| `mobile/src/api/client.ts`, `api/endpoints.ts` | API base URL (`EXPO_PUBLIC_API_URL`) and calls |
| `mobile/src/store/authStore.ts`, `utils/notifications.ts` | Auth flow, push token registration |
| `mobile/src/navigation/RootNavigator.tsx` | Chooses the navigator by role |
| `mobile/src/components/Map.tsx`, `Map.web.tsx` | Native map and web placeholder |
| `mobile/src/screens/admin/CreateStaffScreen.tsx` | Admin UI to create officer and government accounts |
| `mobile/app.json`, `mobile/eas.json` | Expo config and APK build profiles |

## Working conventions

- Work on a branch and open a PR into `master`. Keep one commit per logical change.
- **No Claude attribution:** don't add `Co-Authored-By: Claude` trailers or "Generated with Claude Code" lines to commits or PRs.
- Before pushing, run `npx tsc --noEmit` in `mobile/` and in `server/`, and `npx expo-doctor` in `mobile/`.
- When upgrading Expo, use `npx expo install --fix` so native packages match the SDK.
