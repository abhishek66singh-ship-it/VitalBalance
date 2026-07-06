# VitalBalance — Mobile App (V1 Build)

AI-powered daily energy balance coach. Built with Expo (React Native) + Firebase, per the PRD.

This is a real, working app — not a mockup. It currently implements:

- Email/Password sign up & sign in (Firebase Auth)
- Google Sign-In (Firebase Auth + Google OAuth)
- Onboarding flow (goal, activity level, calorie/macro target calculation)
- Tap-based food logging (tile → variant → portion), writing to Firestore
- Home dashboard: energy balance ring, macros, meal cards
- Rule-based AI Coach insights (PRD section 9), generated from real logged data
- Settings screen with sign out

Not yet implemented (see PRD section 5.2/5.3 for the full fast-follow list):
fitness platform sync (Apple Health / Google Fit / Fitbit — currently mocked),
barcode scanner, trend graphs, gamification, voice/image logging.

---

## 1. Prerequisites

- Node.js 18+ (you have this already if you're reading this from the sandbox)
- A free Google account (for Firebase)
- The **Expo Go** app on your phone (iOS App Store / Google Play) — easiest way to
  preview the app with zero native build setup
- Optional: Xcode (Mac only) for iOS simulator, Android Studio for Android emulator

## 2. Create your Firebase project (one-time, ~10 minutes)

1. Go to **console.firebase.google.com** → **Add project** → name it (e.g.
   "VitalBalance") → you can disable Google Analytics for now → Create.
2. **Build → Authentication → Get started.**
   - Sign-in method tab → enable **Email/Password**.
   - Sign-in method tab → enable **Google**. Firebase will auto-create a
     "Web client (auto created by Google Service)" OAuth client — you'll need its
     Client ID in step 4.
3. **Build → Firestore Database → Create database.**
   - Choose a location close to your users.
   - Start in **production mode** (we ship rules in `firestore.rules`).
4. **Project settings (gear icon, top left) → General tab → scroll to "Your apps".**
   - Click the **Web** icon (`</>`) → register an app (nickname: `vitalbalance-web`)
     → copy the `firebaseConfig` object shown.
   - Also add an **iOS app** (bundle ID: `com.vitalbalance.app`) and an **Android
     app** (package name: `com.vitalbalance.app`) here — you'll need their
     OAuth client IDs for native Google Sign-In. Firebase will show/generate these
     once you enable Google sign-in; alternatively get them from **Google Cloud
     Console → APIs & Services → Credentials**.

## 3. Configure your local `.env`

```bash
cd vitalbalance
cp .env.example .env
```

Open `.env` and paste in the values from step 2 above:

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

`.env` is gitignored — your keys never get committed.

## 4. Deploy Firestore security rules

Install the Firebase CLI once:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # point it at this project, accept the default firestore.rules path
firebase deploy --only firestore:rules
```

This locks Firestore down so each user can only read/write their own data
(see `firestore.rules` — already written for you).

## 5. Install dependencies & run

```bash
npm install
npm start
```

This opens the Expo dev server. Scan the QR code with the **Expo Go** app on your
phone (same Wi-Fi network), or press `i` / `a` in the terminal to launch an iOS/Android
simulator if you have one set up.

---

## Project structure

```
src/
  config/firebase.js       Firebase init (Auth + Firestore)
  context/AuthContext.js   Auth state, sign up/in/out, Google Sign-In
  data/foodLibrary.js      Starter food database (tiles, variants, portions)
  services/logService.js   Firestore reads/writes for daily food logs
  services/aiCoach.js      Rule-based AI Coach insight engine
  navigation/RootNavigator.js   Auth → Onboarding → Main app routing
  screens/                 All screens (Login, SignUp, Onboarding, Home, FoodLogger, Trends, Settings)
  components/              Shared UI (Button, FormInput, ProgressRing)
firestore.rules            Security rules (deploy via Firebase CLI)
.env.example               Template for your Firebase/Google keys
```

## Data model (Firestore)

```
users/{uid}
  - profile fields (goal, activityLevel, dailyCalorieTarget, macro targets, etc.)

users/{uid}/logs/{yyyy-mm-dd}
  - { date, items: [ { foodId, name, mealType, kcal, proteinG, carbsG, fatG, ... } ] }

users/{uid}/favorites/{favoriteId}
  - saved "Favorite Meals" for one-tap re-logging
```

## What's mocked right now (and where to wire up the real thing)

- **Calories burned / steps**: `HomeScreen.js` uses `MOCK_ACTIVITY` — replace with
  real Apple HealthKit / Google Fit / Fitbit data once those integrations are built
  (PRD FR-1.1–1.3). The Firestore schema is already designed to receive this data.
- **AI Coach phrasing**: `src/services/aiCoach.js` generates insights from
  templates (free, works offline). The `phraseInsight()` function is a clean swap
  point for a real LLM call later — see the comment in that file. This is the one
  piece of the PRD that isn't zero-cost once enabled (needs an Anthropic/OpenAI API
  key, billed per request).

## Costs

Everything above runs on Firebase's free **Spark plan** at this scale (generous
daily quotas for Auth and Firestore reads/writes). The only future cost is the LLM
API key for AI Coach phrasing, if/when you turn that on — see PRD section 1
(Executive Summary) cost notes.
