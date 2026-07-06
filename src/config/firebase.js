// Firebase initialization for VitalBalance
//
// Setup instructions (one-time):
// 1. Go to https://console.firebase.google.com -> Create Project (free "Spark" plan).
// 2. Inside the project: Build -> Authentication -> Sign-in method -> enable
//    "Email/Password" and "Google".
// 3. Build -> Firestore Database -> Create database -> start in "production mode"
//    (we ship our own security rules in firestore.rules).
// 4. Project settings (gear icon) -> General -> "Your apps" -> Add app -> Web (</>)
//    Register the app (nickname can be "vitalbalance-web") and copy the firebaseConfig
//    object it gives you.
// 5. Paste those values into a `.env` file at the project root (see `.env.example`).
//    Never commit `.env` to git — it's already in .gitignore.
//
// For Google Sign-In specifically, you also need an OAuth Web Client ID:
// Project settings -> General -> scroll to "Your apps" -> the Web app's config
// includes it, OR get it from Google Cloud Console -> APIs & Services ->
// Credentials -> OAuth 2.0 Client IDs -> "Web client (auto created by Google Service)".
// Put that value in EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.

import { initializeApp, getApps, getApp } from "firebase/app";
// NOTE: getReactNativePersistence is resolved at runtime via React Native's
// module resolution (the package's "react-native" field), not a separate
// subpath. Editors/TypeScript may flag this as missing — that's a known false
// positive (see firebase-js-sdk issues #7615, #9316); it works correctly on device.
// @ts-ignore
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Avoid re-initializing on fast-refresh
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // initializeAuth throws if already initialized (e.g. fast refresh) — reuse it.
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
