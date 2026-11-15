# DriveDock student pilot (16 Nov 2026)

A **student pilot / test build** using **synthetic data** and **test payments only**. It is not a government service: there is no VAHAN integration and no government approval, and nothing in it is a real PUC certificate.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Pilot MongoDB 7 | `127.0.0.1:27019`, data in `~/drivedock-pilot/mongo-20261116` | Separate process and folder; the usual dev databases are untouched |
| Pilot database | `drivedock_pilot_20261116` | Synthetic NCR walkthrough dataset |
| Pilot API | `localhost:5002`, config from `server/.env.pilot` (git-ignored, mode 600) | `NODE_ENV=development` because production mode refuses to start while payments/SMS/registry are sandboxes (that guard is kept). All secrets are random, `DEMO_MODE=false`, `TRUST_PROXY=1`, Razorpay placeholder keys (test mode only) |
| Public HTTPS | `https://credibly-arrange-subprime.ngrok-free.dev` → port 5002 only | ngrok static domain; the laptop must stay on with ngrok running |
| Android APK | EAS project `@angelina10/drivedock`, profile `pilot` | Internal distribution APK, API URL baked in at build time |

## Hosted pilot (no laptop needed)

| Piece | Where |
|---|---|
| API | https://drivedock-pilot-api.onrender.com (Render free, Singapore, service `drivedock-pilot-api`, blueprint `drivedock-pilot` from `render.yaml`, branch `pilot/20261116`, auto-deploy off: use Manual Deploy) |
| Database | MongoDB Atlas project "DriveDock Pilot", free cluster `Cluster0` (Mumbai), database `drivedock_pilot_20261116`; network access 0.0.0.0/0 because Render free has no static IP |
| Secrets | Render generates the token secrets; `MONGO_URI` and `PAPERWORK_ENCRYPTION_KEYS` were pasted from the git-ignored `server/.env.render` |
| APK | EAS build `594480ee-f2e4-46dc-b74d-01ed44384437`, profile `pilot`, refreshed UI from master `2e638f1`, calls the Render API (verified in the bundle) |

- Render free sleeps after 15 min idle; the first request then takes up to a minute. Open https://drivedock-pilot-api.onrender.com/readyz on your phone 2 minutes before a demo and wait for `{"status":"ready","db":1}`.
- Uploaded certificates live on Render's temporary disk and disappear when it sleeps or redeploys; database records stay in Atlas.
- Reset the hosted demo data: `cd server && npm run pilot:seed && scripts/pilot-to-atlas.sh --confirm=drivedock_pilot_20261116` (needs the local pilot MongoDB on 27019).
- Verified 16 Nov 2026 02:15 IST: `/readyz` ready, 29/29 end-to-end checks pass against Render, certificate links are https.

## Release: pilot APK (verified 16 Nov 2026)

| Item | Value |
|---|---|
| EAS build | `594480ee-f2e4-46dc-b74d-01ed44384437`, status FINISHED, profile `pilot`, refreshed UI from master `2e638f1` |
| Install URL (direct APK) | https://expo.dev/artifacts/eas/Qae8BhD8dxHJwpBfKjoD-yr_yWg7wRFj12KIzlR1dZk.apk (downloaded without login: HTTP 200, 113,233,639 bytes) |
| SHA-256 | `0ce0e3fc90dde7c2a23fae6fe252c9a0f671755111726ef108b256e92ad2ed03` |
| API in the APK | Hermes bundle contains `https://drivedock-pilot-api.onrender.com/api/v1` and the pilot label; the old ngrok API and `localhost:5001` are absent |
| UI in the APK | Updated login, inspection desk and verification result labels are present in the compiled bundle |
| Install QR | `docs/pilot/install-qr.png`, `docs/pilot/install-qr.svg`; decoded to the exact APK URL |
| Landing page + card | Updated `docs/pilot/install-page.html` and `docs/pilot/install-card.pdf`. The previously shared Claude artifact is an older external copy and was not updated here |
| Physical device validation | Not yet performed for this new UI APK. An older APK had launched successfully on a Motorola Edge 50 Neo; that result is not a device test of this build |

The release retains the WorkManager Room keep-rules fix. The login pitch-demo label has been replaced by the new sign-in UI; development-only role buttons remain hidden in release builds. Dependencies and signing credentials were not changed.

## Start everything (after a reboot)

```bash
/opt/homebrew/bin/mongod --dbpath ~/drivedock-pilot/mongo-20261116 --port 27019 --bind_ip 127.0.0.1 --logpath ~/drivedock-pilot/mongod.log &
cd server && npm run pilot:api        # API on :5002 with .env.pilot
ngrok http 5002                       # reuses the account's static domain
curl https://credibly-arrange-subprime.ngrok-free.dev/readyz   # {"status":"ready","db":1}
```

Re-seed to a clean state before the demo (only works on the pilot DB; signs everyone out):

```bash
cd server && npm run pilot:seed
```

The guard in `scripts/seed-pilot.ts` refuses unless `NODE_ENV` isn't production, the URI is a local `mongodb://` URI, the database is named `drivedock_pilot_YYYYMMDD`, `--confirm=<db>` matches, `SEED_PASSWORD` has 12+ characters, and the database is either empty or carries the `pilot_meta` marker from an earlier pilot seed. It clears users, vehicles, documents, providers, slots, bookings, payments, reminders, violations, challans, transfers, shares, sessions, audit and paperwork collections **in that database only**, then inserts the dataset.

## Accounts

The password for every seeded account is `SEED_PASSWORD` in `server/.env.pilot`. Share it in person, never on the landing page or in slides.

| Role | Login |
|---|---|
| Owner | owner@drivedock.com |
| Second owner (buyer) | buyer@drivedock.com |
| Approved station (Capital Auto) | provider@drivedock.com |
| Other stations | station2…9@drivedock.demo |
| Pending station | pending.provider@drivedock.com |
| Officer | officer@drivedock.com (also officer2/3@drivedock.demo) |
| Government | gov@drivedock.com |
| Admin | admin@drivedock.com |

Walkthrough vehicles (owner): `DL3CAB1234` GREEN, `DL8CAF5678` RED with a pending e-challan, `HR26DK9012` PUC due in 5 days, `UP16KB4321` PUC already booked at Capital Auto, `DL4CXY7788` no documents.

## Teacher demo script (5–7 minutes)

1. **The problem (30 s).** Papers are photos, and photos can be faked. DriveDock counts a document as verified only after an approved centre completes a paid service and uploads the certificate. Point at the yellow "student pilot · test build" banner.
2. **Owner (1 min).** Log in as owner. Dashboard → `DL3CAB1234` → Show QR. The QR rotates and expires in 2 minutes.
3. **Officer (1 min).** On a second phone, log in as officer → Scan → GREEN. Scan `DL8CAF5678` → RED with reasons. Log a violation → the e-challan amount comes from the server's fee table.
4. **Renewal and booking (1.5 min).** Owner → Renewals → `HR26DK9012` → PUC → choose a station → Book & Pay (labelled test payment; no money moves). Show that booking the same document again is refused, and that a document that's still valid can't be renewed early.
5. **Station (1 min).** Log in as provider (Capital Auto) → Inspection Orders → the booking → Certify & Complete with a sample PDF → the owner's PUC flips to verified.
6. **Admin and government (1 min).** Admin → approve the pending station (Raj Nagar Quick PUC) → it becomes bookable. Government → compliance overview (sample data).
7. **Used-car buyer (optional, 1 min).** Owner: `DL3CAB1234` Twin → Transfer QR. Buyer: Add Vehicle → Buy a used car → Scan → report → Apply. The owner approves, and the car moves.

Backup if mobile data fails: run the web build (`cd mobile && npx expo start --web`) against the same API.

## Petrol-pump / testing-centre onboarding walkthrough

What a station partner does, and what each step does and doesn't mean:

1. **Install** the pilot APK from the install page and **sign up choosing the provider (station) role** (business name, email, phone, password of 8+ characters with a letter and a number).
2. **Centre profile** (shown before anything else): location from the phone's GPS, address, services offered (e.g. PUC), working hours, number of service bays.
3. **Pending.** The centre is hidden from search and can't take bookings. This is **DriveDock admin approval inside the pilot**, not a regulatory licence. A real centre must already hold its own authorisation (e.g. a PUC centre licence from the state transport department). DriveDock doesn't grant or check that licence today.
4. **Admin approves** (admin → Providers → Approve). There is no auto-approval.
5. **Slots.** Manage Slots → date + Morning/Afternoon/Full Day template. Each slot holds as many bookings as the centre has bays.
6. **Bookings arrive** under Inspection Orders once the owner has paid (test mode).
7. **Complete** with the certificate file and its issue and expiry dates. In the pilot, use sample files only. No real PUC is issued, and the "verified" badge means "certified by a DriveDock-approved centre in this test", never "government-verified".

Real names from OpenStreetMap appear only in the separate `npm run seed:demo` toolkit and are not partners. The pilot dataset's stations are fictional.

## Tests run on 16 Nov 2026

- Server unit and integration: `DEMO_MODE=false MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod npx jest --runInBand` → **410/410 passed**.
- `npx tsc --noEmit` in `server/` and `mobile/` → clean.
- Seed guard refusals (no URI, non-pilot DB name, SRV/Atlas URI, non-local host, missing confirm, short password, production) → all 7 refused before connecting.
- Through the public HTTPS URL: 29/29 API checks passed (logins for 5 roles; GREEN/RED scans; forged QR → 401; government overview; admin pending list; owner blocked from admin → 403; signup refuses admin role; provider signup → profile → pending hidden → approve → visible → slots; booking; duplicate → 409; server-set amount; bad signature → 400; test payment confirms; certificate completion → verified + hash; provider can't self-confirm; officer violation → e-challan; certificate link is https and opens).
- `npx expo-doctor`: 1 check failed (17 packages behind SDK 58's expected versions). Not fixed, to avoid changing dependencies on demo day.
- **Not run:** install and tap-through on a physical Android phone, push notifications, maps in the APK, iOS.

## Real-device test checklist (Android APK)

Use two phones if possible (A = owner/provider, B = officer/buyer). Tick each one; anything that fails goes to the fallback below.

| # | Area | Steps | Expected |
|---|---|---|---|
| 1 | Install | Open the install link → download APK → allow "install unknown apps" → open | App opens with the yellow "student pilot · test build" banner, no crash |
| 2 | Login | Owner login with the pilot password; kill and reopen the app | Dashboard loads; still signed in after reopening. No demo buttons visible (release build) |
| 3 | Wrong password | Log in with a wrong password | "Invalid credentials", no crash |
| 4 | Passport | Open each of the 5 walkthrough vehicles | Documents and statuses load; DL3CAB1234 compliant, DL8CAF5678 not |
| 5 | Upload | DL4CXY7788 → Manage Papers → pick dates → camera photo, then a PDF | Camera and file picker permission prompts appear; upload completes; stays UNVERIFIED |
| 6 | Owner QR | DL3CAB1234 → Show QR | QR renders, countdown runs, refreshes after expiry |
| 7 | Officer scan | Phone B: officer → Scan → allow camera → scan phone A's QR | GREEN for DL3CAB1234, RED with reasons for DL8CAF5678 |
| 8 | Violation | Officer → log violation on DL8CAF5678 | Fee shown read-only; e-challan appears for the owner |
| 9 | Stations | Owner → Stations → allow location (then retry denying it) | List of stations loads. Map tiles grey (expected). Denying asks for a city name |
| 10 | Booking | Renewals → HR26DK9012 → PUC → station → date → slot → Book & Pay | Price from server; test payment confirms; booking again is refused |
| 11 | Provider | Log out → provider@drivedock.com → Inspection Orders | New booking listed (and UP16KB4321) |
| 12 | Certificate | Certify & Complete → dates → camera or PDF certificate | Completes; the owner's PUC turns verified; the certificate opens (https link) |
| 13 | Admin | admin → Providers → approve Raj Nagar Quick PUC | Status approved; station appears in owner search |
| 14 | Government | gov → dashboard | Charts and numbers load (sample data) |
| 15 | Vehicle Twin | DL3CAB1234 → Twin | Score, timeline, ledger intact |
| 16 | Transfer | Owner: Twin → Transfer QR. Phone B buyer: Add Vehicle → Buy a used car → Scan → Apply. Owner approves | Car moves to the buyer; checklist opens |
| 17 | Network loss | Turn on airplane mode mid-screen, then off | Error message, not an endless spinner; works again afterwards |
| 18 | Session | Leave the app idle >15 min, then use it | Silent refresh; still signed in |

## Runtime risks automated API tests cannot catch

- **Native permissions:** camera (officer scan, uploads), location and media prompts only appear on a device; a denied permission must be re-enabled in Android Settings.
- **Release-only behaviour:** `__DEV__` is false, so the demo login buttons and the manual QR-token paste box are hidden. Typing the password is required.
- **Maps:** grey tiles (placeholder key). The app shouldn't crash, but this hasn't been seen on a device yet.
- **Push:** no Firebase/FCM credentials are configured, so token registration fails quietly (wrapped in try/catch) and no reminder pushes arrive.
- **ngrok and network:** campus Wi-Fi may block ngrok domains, so keep mobile data as a backup. The laptop must not sleep (`caffeinate -dims` keeps it awake).
- **Clock skew:** QR tokens last 120 s, so a phone with a wrong clock may show expired tokens. Turn on automatic time.
- **File handling:** large camera photos on slow data may hit the 2-minute upload timeout. PDFs open through the system viewer, which needs a PDF app.
- **Old Android versions / small screens:** layout, keyboard covering inputs, back-button behaviour.
- **Dependency drift:** expo-doctor flags 17 packages behind SDK 58. A native mismatch would show as a crash on a specific screen, so tap every screen once.

## Restart and health checks (no secrets printed)

```bash
# 1. MongoDB (pilot only)
/opt/homebrew/bin/mongod --dbpath ~/drivedock-pilot/mongo-20261116 --port 27019 --bind_ip 127.0.0.1 --logpath ~/drivedock-pilot/mongod.log --fork
mongosh --quiet --port 27019 --eval 'db.runCommand({ping:1}).ok'                 # 1

# 2. API (new terminal; reads server/.env.pilot)
cd ~/DriveDock/server && npm run pilot:api
curl -s localhost:5002/healthz                                                   # {"status":"ok"}
curl -s localhost:5002/readyz                                                    # {"status":"ready","db":1}

# 3. ngrok (new terminal)
ngrok http 5002 --url https://credibly-arrange-subprime.ngrok-free.dev
curl -s https://credibly-arrange-subprime.ngrok-free.dev/readyz                  # same as above
curl -s localhost:4040/api/tunnels | python3 -c 'import sys,json;print([t["public_url"] for t in json.load(sys.stdin)["tunnels"]])'

# 4. Expo web fallback (only if needed; needs mobile/.env.local, see below)
cd ~/DriveDock/mobile && npx expo start --web --port 8081
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081                          # 200

# Optional: clean data right before the demo (signs everyone out)
cd ~/DriveDock/server && npm run pilot:seed
# Keep the laptop awake during the demo
caffeinate -dims &
```

Is it all up? `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(27019|5002|4040|8081) '`

## Browser fallback (APK or camera fails)

1. `mobile/.env.local` (git-ignored) points the browser app at the pilot API and sets a "browser fallback" banner. Expo's dev server reads `EXPO_PUBLIC_*` only from `.env` files, not the shell. **Delete it after the demo** to return normal development to its usual API.
   ```
   EXPO_PUBLIC_API_URL=http://localhost:5002/api/v1
   EXPO_PUBLIC_BUILD_LABEL=DriveDock student pilot · browser fallback · synthetic data · test payments only
   ```
2. Start: `cd mobile && npx expo start --web --port 8081`, then open http://localhost:8081 in two browser windows (one normal, one incognito, so two people can be signed in).
3. **Type** email and pilot password. The one-tap demo buttons still use the old `password123` and will fail against the pilot.
4. Officer scan without a camera: in the officer window use the dev-only **Paste JWT token** box. Get a fresh token (valid 2 min) with
   `cd server && scripts/pilot-qr-token.sh DL3CAB1234` (or `DL8CAF5678` for RED), then paste and verify.
5. Uploads: the browser file picker works for images and PDFs; the camera may not. Maps show a placeholder on web.
6. Everything else (booking, test payment, provider completion, admin approval, government dashboard, Twin) works the same as in the APK.

## Known limitations

- **Payments are test-only.** The server hands the app a test signature, and no money moves. Challan "Pay" marks a challan paid without payment.
- **Maps** show grey tiles in the APK (Google Maps key is still a placeholder). Station lists and booking still work.
- **Uploads** live on the laptop disk (`server/uploads/`), served by the API.
- **Availability** depends on the laptop, mongod, the API and ngrok all running. A free ngrok domain may show a browser warning page to web browsers, though not to the app.
- **Reminders** run at 00:00 but push needs the APK plus a granted notification permission. Not tested on a device.
- **iOS:** no build. iPhone users can use Expo Go or the web build on the same Wi-Fi only.
- Not production: `NODE_ENV=development` by necessity (see above), no real KYC, no SMS/email, no VAHAN.

## Handover summary (paste into another chat)

> DriveDock is a student vehicle-compliance app (Expo SDK 58 mobile + Express/TypeScript/MongoDB API, five roles: owner, provider, officer, government, admin). A document is "verified" only when an admin-approved centre completes a paid (test-mode) booking and uploads a certificate. The owner shows a 2-minute rotating QR that officers scan for GREEN/RED. For the 16 Nov 2026 evaluation a pilot runs on branch `pilot/20261116`: an isolated MongoDB 7 on port 27019 (`drivedock_pilot_20261116`, synthetic NCR data via the guarded `npm run pilot:seed`), the API on port 5002 using git-ignored `server/.env.pilot` (random secrets, DEMO_MODE off, test payments), exposed over HTTPS by ngrok at `credibly-arrange-subprime.ngrok-free.dev`, and an Android APK from the EAS `pilot` profile (project `@angelina10/drivedock`, build b03a34ce, verified to call the ngrok HTTPS API) with a "student pilot · test build" banner; install page and QR in `docs/pilot/`. Browser fallback: `mobile/.env.local` + `npx expo start --web`, with `server/scripts/pilot-qr-token.sh` for officer scans without a camera. Known gaps: test-only payments, placeholder Maps key, local-disk uploads, laptop-hosted, no iOS build, no VAHAN or government approval.
