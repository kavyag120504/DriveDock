# Push notifications (Android)

What the code already does, and the few steps that need a Google/Expo account.

## What is built

- **Server** (`server/src/services/notify.ts`, `notificationService.ts`): `notifyUser` saves an in-app inbox entry, then sends a push through the Expo Push API if the user has a device token. Events: booking confirmed / completed / cancelled, payment, challan issued, transfer requested / approved / declined, provider approved or rejected, expiry reminders. A device Expo reports as `DeviceNotRegistered` has its token cleared.
- **Inbox**: `GET /api/v1/notifications` and `POST /api/v1/notifications/read`. The bell in the header of every role shows the unread count, refreshes every minute, on return to the app and when a push arrives. This works without Firebase, so nothing is lost when a push cannot be delivered.
- **App** (`mobile/src/utils/notifications.ts`): asks permission, creates the Android channel "DriveDock Alerts", registers the Expo push token, shows pushes while the app is open. Skipped in Expo Go (Android push was removed there in SDK 53); use the APK.

## What you must set up (not possible from code)

Push on Android needs Firebase Cloud Messaging.

1. Create a project at console.firebase.google.com (any Google account) and add an Android app with package name `com.drivedock.app`.
2. Download `google-services.json`.
3. Give it to EAS as a **file** environment variable, never commit it:
   ```powershell
   cd mobile
   npx eas env:create --name GOOGLE_SERVICES_JSON --type file --visibility secret --environment preview --value ./google-services.json
   ```
   `mobile/app.config.js` reads `GOOGLE_SERVICES_JSON` and sets `android.googleServicesFile` (and `extra.pushConfigured`).
4. In Firebase: Project settings, Service accounts, "Generate new private key". Upload that JSON to Expo with `npx eas credentials` (Android, Push Notifications: FCM V1 service account key).
5. Rebuild the APK (`npx eas build --platform android --profile preview`). Push registration only works in a build made after steps 2-4.
6. Optional hardening: create an Expo access token and set `EXPO_ACCESS_TOKEN` on the server, then turn on "enhanced push security" in the Expo dashboard.

## Checking it

- Log in on the APK, accept the notification permission, and in dev builds watch the Metro log for `[push]` warnings (a missing Firebase file shows as a registration error).
- Trigger an event (for example have a provider complete a booking) and look for the push, and for the entry in the bell.
- Tests: `cd server && npx jest src/__tests__/notifications.api.test.ts --runInBand`.
