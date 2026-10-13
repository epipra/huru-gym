# Google Play Console: Huru GYM

> 2026-10-13. Account: AdxFuel LLC (developer id 5694194224658562079), which already publishes other apps, so a policy strike here affects them too: answer every form exactly as below and change the answers when the app changes.

## 1. Create the app (once)
Play Console -> All apps -> Create app.

| Field | Value |
|---|---|
| App name | Huru GYM |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free (Pro is a subscription, sold on the web for now; never mark the app as paid) |
| Declarations | Tick both (Developer Program Policies, US export laws) |

The package name is fixed by the first upload: `com.adxfuel.hurugym`. It can never change.

## 2. First upload: internal testing
Testing -> Internal testing -> Create new release.
1. **App signing:** choose *Use Google-generated key* (Play App Signing). Our key (`D:\DevOps\Huru GYM\secrets\huru-upload.jks`) becomes the **upload key**; upload certificate SHA-256 `D8:DC:5C:BA:F5:8B:20:83:F9:EA:4B:E2:B0:C9:D0:C9:26:F9:1C:33:09:B0:14:21:A7:6B:2E:FE:3D:A4:8F:52`.
2. **App bundle:** upload the `.aab` (not the `.apk`) from the latest *Huru Android* workflow run (also copied to `D:\DevOps\Huru GYM\android-builds\`). Every upload needs a higher version code; each workflow run has one.
3. Release name: the version in the file name (e.g. `1.4.1-huru.3`). Release notes: "First test build of Huru GYM."
4. Testers tab: create an email list (up to 100 Google accounts), save, copy the **opt-in link** and send it to testers. Internal testing has no review wait.

## 3. App content (Policy -> App content)
| Section | Answer |
|---|---|
| Privacy policy | https://gym.adxfuel.com/legal/privacy.html |
| Ads | No, the app does not contain ads |
| App access | *All or some functionality is restricted*. Instructions: "The app works without an account: on first start tap "Use on this device", then log workouts. Syncing, the AI Coach and Pro need an invite-only account on gym.adxfuel.com, paired from the website (Settings, Account, Pair the mobile app). Reviewer account: name `<REVIEWER NAME>`, password `<REVIEWER PASSWORD>`; sign in at https://gym.adxfuel.com, open Settings, Account, Pair the mobile app, and enter the code in the app." Create that reviewer profile with an invite code and give it free Pro (Admin, the profile, Huru GYM Pro). |
| Content rating | Questionnaire, category *All other app types*. No violence, sexual content, profanity, drugs, gambling. Users do not interact with or share content with each other. Expected: Everyone / PEGI 3 |
| Target audience | 18 and over (the Terms allow 16+, but no under-18 marketing) |
| News app | No |
| Government app | No |
| Financial features | None |
| Health apps | Yes. Features: *Activity and fitness tracking*, *Nutrition and weight management* (body weight only). Not a medical device; no medical advice |
| Health Connect | Write access to **Exercise** and **Weight**. Purpose: "Saves the user's completed workouts and weigh-ins to Health Connect when they turn on Health Connect sync in Settings. Off by default; nothing is read." |
| Foreground service | Type *Special use*. Description: "Shows the running rest timer between sets as an ongoing notification during a workout the user started, so the countdown and its alert survive the screen turning off. It stops when the rest ends or the workout finishes." If a video is asked for: record starting a workout, finishing a set, locking the phone and the notification counting down |
| Exact alarms | Uses SCHEDULE_EXACT_ALARM (user-visible rest timer alert); no declaration needed, USE_EXACT_ALARM is not used |

## 4. Data safety
Collected: yes. Shared with third parties: no (Stripe, OpenAI, Google Workspace and Cloudflare act as service providers, which Play does not count as sharing). Encrypted in transit: yes. Deletion: users can request it, in the app (Settings, Account, Delete account) and at https://gym.adxfuel.com/legal/delete-account.html.

| Data type | Collected | Optional | Purposes |
|---|---|---|---|
| Personal info: Name | Yes | No (account) | App functionality, Account management |
| Personal info: Email address | Yes | Yes | Account management (sign-in, password reset) |
| Health and fitness: Fitness info | Yes | No | App functionality, Personalization (AI Coach) |
| Health and fitness: Health info | Yes | Yes (injuries told to the Coach, body measurements) | App functionality |
| Photos and videos: Photos, Videos | Yes | Yes (progress photos, own exercise media) | App functionality |
| Financial info: Purchase history | Yes | Yes (Pro subscription status) | App functionality, Account management |
| Device or other IDs | Yes | Yes (push notification address) | App functionality |
| App info and performance: Crash logs | No | | |
| Location, Contacts, Messages, Web browsing | No | | |

Data stays on the device only in local mode; the answers cover the account mode, which is the stricter case.

## 5. Store listing (Grow -> Store presence -> Main store listing)
- **App name (30):** Huru GYM: Workout Tracker
- **Short description (80):** Log sets fast, progress your weights automatically and track every PR.
- **Full description:**

  Huru GYM is a workout tracker for people who lift. Log a set in two taps, rest with a timer that keeps running on the lock screen, and let your plan move the weights up when you hit your reps.

  TRAIN
  - Fast set logging with a rest timer and supersets
  - Plans that progress automatically: linear, double progression and more
  - 5,600+ exercises with instructions, plus your own

  TRACK
  - Personal records and estimated one-rep max
  - Progress charts for every lift, volume and muscle balance
  - Body weight and measurements, with Health Connect sync

  HURU GYM PRO
  - An AI Coach that builds your plan and reviews your training, with every change shown before it applies
  - 7-day free trial

  YOUR DATA IS YOURS
  - No ads, nothing sold
  - Use it on your phone only, or sync with your account across devices
  - Export or delete everything at any time

  Huru GYM is made by AdxFuel LLC and based on the open-source openGym project (AGPL-3.0). Source code: https://github.com/epipra/huru-gym

- **App icon:** `brand/huru/icons/icon-512.png`
- **Feature graphic (1024x500):** `brand/huru/play/feature-graphic.png`
- **Phone screenshots:** 2 to 8, portrait, from the app (to do: plan, workout in progress, progress chart, Coach)
- **Category:** Health & Fitness. **Tags:** workout tracker, gym, strength training
- **Contact:** support@adxfuel.com, website https://gym.adxfuel.com

## 6. Before production (not for internal testing)
- Google Play Billing for Pro inside the app (Play policy: digital subscriptions sold in an app go through Play Billing). Until then the app does not sell Pro or point to the web to buy it.
- Real logo and screenshots; a closed test with real users first.
