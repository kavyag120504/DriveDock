# DriveDock — CLAUDE.md

Multi-role vehicle compliance platform. One React Native app, four roles: Owner, Provider, Officer, Government. Built for a college project demo.

## Project Structure

```
D:\PRJ4\
├── mobile/          # React Native (Expo SDK 52) app
├── server/          # Node.js + Express + MongoDB backend
├── docs/
└── CLAUDE.md
```

## Tech Stack

| Layer | Choice |
|---|---|
| Mobile | React Native via Expo SDK 52 (managed workflow) |
| Navigation | React Navigation (stack + bottom tabs, role-based) |
| State | Zustand (auth/local), TanStack Query (server state) |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB (Mongoose) |
| Auth | JWT access (~15min) + refresh (~7d), expo-secure-store on device |
| File uploads | AWS S3 (auto-falls back to local if keys are blank) |
| Push notifications | expo-notifications + Expo Push API (no Firebase setup needed) |
| Payments | Razorpay test mode — mock flow with server-side HMAC verification |
| Maps | react-native-maps (Google provider) |
| QR | react-native-qrcode-svg (generate) + expo-camera (scan) |

## Running the Project

### Backend
```bash
cd server
npm run dev          # ts-node-dev, hot reload on :5000
npm run seed         # populate demo data (wipes + re-seeds)
```

### Mobile
```bash
cd mobile
npx expo start --clear    # shows QR code — scan with Expo Go on phone
# press w → web preview (no camera/maps but good for UI checks)
```

### Environment — server/.env (already configured for local dev)
- `MONGO_URI` = `mongodb://127.0.0.1:27017/drivedock`
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` = test keys set
- `GOOGLE_MAPS_API_KEY` = **EMPTY** — maps won't work in production APK until filled
- `EXPO_ACCESS_TOKEN` = **EMPTY** — push notifications work in Expo Go, set for production

## Demo Credentials (after `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Owner | owner@drivedock.com | password123 |
| Provider (approved) | provider@drivedock.com | password123 |
| Officer | officer@drivedock.com | password123 |
| Government | gov@drivedock.com | password123 |
| Admin | admin@drivedock.com | password123 |

## Implementation Status — All Milestones Complete

| Milestone | Status | What's in it |
|---|---|---|
| M1 — Auth | ✅ Done | Login/signup for all 5 roles, JWT, expo-secure-store |
| M2 — Flow A | ✅ Done | Add vehicle, upload docs (unverified), reminder cron, push notifications |
| M3 — Admin approval | ✅ Done | providers.status gate, admin screens |
| M4 — Flow B | ✅ Done | Atomic slot booking (409), Razorpay mock + HMAC verify, camera upload sets verified:true |
| M5 — Flow C | ✅ Done | Rotating 2-min QR tokens, expo-camera scan, green/red check (verified:true only) |
| M6 — Flow D | ✅ Done | Government overview, region map, document trends (custom bar chart) |
| M7 — Polish | ✅ Done | Challans (mocked), seed script, eas.json created |

## 3 Things Still Needed Before APK Demo

**1. Google Maps API key** (maps show gray tiles in APK without it)
- Google Cloud Console → enable Maps SDK for Android → Credentials → Create API Key
- Add to `mobile/app.json` → replace `YOUR_GOOGLE_MAPS_API_KEY`
- Add to `server/.env` → `GOOGLE_MAPS_API_KEY=your_key`

**2. EAS project init** (needed for push tokens in the APK)
```bash
cd mobile
npx eas login
npx eas project:init     # auto-fills YOUR_EAS_PROJECT_ID in app.json
```

**3. Build the APK**
```bash
cd mobile
npx eas build --platform android --profile preview
# downloads as .apk — share link for examiners to install directly
```

## Key Architecture & Trust Rules (important for viva)

1. **verified:true only set by provider** — owner can upload a doc photo (unverified), but `verified: true` + `issuedByProviderId` are ONLY set when a provider completes a booking. This is the single most important integrity rule. The QR green status checks `verified: true` — an unverified upload never turns the QR green.

2. **Rotating QR tokens** — `GET /vehicles/:id/qr-token` returns a JWT signed with `QR_SECRET`, expires in 2 minutes. The app re-fetches it before expiry. `GET /public/verify?token=` verifies the signature. Screenshots go stale after 2 min. Do NOT use the old static `/:qrCodeId` pattern.

3. **Atomic slot booking** — uses `Slot.findOneAndUpdate({_id, isBooked: false}, {isBooked: true})`. If it returns null, the slot was taken → 409. Never read-then-write in two steps.

4. **Provider approval gate** — `providers.status: "pending"|"approved"|"suspended"`. Only `approved` providers appear in search and can complete bookings. Admin controls this via `PATCH /admin/providers/:id/status`.

5. **Payment verification** — server re-computes `crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)` over `orderId|paymentId` and compares with the client signature. Booking only confirmed after this passes.

6. **Reminder cron is "due and not sent"** — queries `scheduledFor <= now AND sent: false`. Self-healing: if the server was down, it catches up on the next run. Runs daily at midnight via node-cron.

## API Base URL

`/api/v1` — all routes except `/auth/*` and `/public/verify` require `Authorization: Bearer <token>`.

## Key Files

| File | Purpose |
|---|---|
| `mobile/src/store/authStore.ts` | Zustand auth store — login/signup/logout/checkAuth, registers push token |
| `mobile/src/utils/notifications.ts` | Push token registration utility |
| `mobile/src/navigation/RootNavigator.tsx` | Picks the right navigator based on user.role |
| `mobile/app.json` | Expo config — plugins, permissions, Maps key placeholder |
| `mobile/eas.json` | EAS Build config — `preview` profile = installable APK |
| `server/src/controllers/bookingController.ts` | Atomic booking + sets verified:true on completion |
| `server/src/services/qrService.ts` | Rotating QR token generation and verification |
| `server/src/services/paymentService.ts` | HMAC signature verification |
| `server/src/cron/reminderCron.ts` | Daily reminder job setup |
| `server/src/controllers/reminderController.ts` | "Due and not sent" job logic |
| `server/scripts/seed.ts` | Demo data seeder — run with `npm run seed` |

## What NOT to Build (per plan)

- EV charging module — schema has `fuelType: "ev"` reserved but do not implement
- Real VAHAN database integration — government dashboard uses seeded/aggregated data only
- expo-barcode-scanner — deprecated, removed in recent SDKs. Use expo-camera's built-in barcode scanning
