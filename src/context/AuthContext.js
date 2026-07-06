import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../config/firebase";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // Firestore user doc (goals, targets, etc.)
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState(null);

  // --- Google Sign-In (Expo AuthSession) ---
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential).catch((e) => setAuthError(e.message));
    } else if (response?.type === "error") {
      setAuthError("Google sign-in was cancelled or failed.");
    }
  }, [response]);

  // --- Firebase auth state listener ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await ensureUserDoc(firebaseUser);
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } else {
        setProfile(null);
      }
      setInitializing(false);
    });
    return unsub;
  }, []);

  async function ensureUserDoc(firebaseUser) {
    const ref = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        email: firebaseUser.email || null,
        displayName: firebaseUser.displayName || null,
        photoURL: firebaseUser.photoURL || null,
        createdAt: serverTimestamp(),
        onboardingComplete: false,
        goal: null, // "lose" | "maintain" | "gain"
        activityLevel: null, // "sedentary" | "light" | "moderate" | "active"
        dailyCalorieTarget: null,
        proteinTargetG: null,
        carbsTargetG: null,
        fatTargetG: null,
        connectedFitnessSources: [],
      });
    }
  }

  async function signUpWithEmail(email, password, displayName) {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(cred.user, { displayName });
      }
      return cred.user;
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  }

  async function signInWithEmail(email, password) {
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user;
    } catch (e) {
      setAuthError(mapAuthError(e));
      throw e;
    }
  }

  async function signInWithGoogle() {
    setAuthError(null);
    await promptAsync();
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  async function refreshProfile() {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    setProfile(snap.exists() ? snap.data() : null);
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      initializing,
      authError,
      googleRequestReady: !!request,
      signUpWithEmail,
      signInWithEmail,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [user, profile, initializing, authError, request]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function mapAuthError(e) {
  switch (e.code) {
    case "auth/email-already-in-use":
      return "That email is already registered. Try signing in instead.";
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    default:
      return e.message || "Something went wrong. Please try again.";
  }
}
