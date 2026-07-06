// Firestore data access for daily food logs.
//
// Schema:
//   users/{uid}                          -> profile doc (see AuthContext.ensureUserDoc)
//   users/{uid}/logs/{yyyy-mm-dd}         -> { date, items: [...], caloriesBurned, steps, createdAt, updatedAt }
//   users/{uid}/favorites/{favoriteId}    -> saved "Favorite Meals" (FR-2.7)
//
// Each item logged inside a day doc looks like:
//   {
//     id: string,
//     foodId: string,
//     name: string,
//     emoji: string,
//     mealType: "breakfast" | "lunch" | "dinner" | "snack",
//     variant: string | null,
//     portionLabel: string,
//     grams: number,
//     kcal: number,
//     proteinG: number,
//     carbsG: number,
//     fatG: number,
//     loggedAt: ISO string,
//   }
//
// caloriesBurned / steps on the day doc are currently written from the mocked
// activity value in HomeScreen (see MOCK_ACTIVITY there) so Trends has real
// data to chart. Once real fitness-platform sync (FR-1.1-1.3) lands, that sync
// job should write here instead via setDayActivity().

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit as fbLimit,
} from "firebase/firestore";
import { db } from "../config/firebase";

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getDayLog(uid, dateKey) {
  const ref = doc(db, "users", uid, "logs", dateKey);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  return { date: dateKey, items: [] };
}

export async function addLoggedItem(uid, dateKey, item) {
  const ref = doc(db, "users", uid, "logs", dateKey);
  const current = await getDayLog(uid, dateKey);
  const items = [...(current.items || []), item];
  await setDoc(
    ref,
    { date: dateKey, items, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return items;
}

export async function removeLoggedItem(uid, dateKey, itemId) {
  const current = await getDayLog(uid, dateKey);
  const items = (current.items || []).filter((i) => i.id !== itemId);
  const ref = doc(db, "users", uid, "logs", dateKey);
  await setDoc(
    ref,
    { date: dateKey, items, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return items;
}

export async function getRecentLogs(uid, days = 7) {
  const ref = collection(db, "users", uid, "logs");
  const q = query(ref, orderBy("date", "desc"), fbLimit(days));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).sort((a, b) => a.date.localeCompare(b.date));
}

// Writes/updates the calories-burned (+ optional steps) value for a given day.
// Currently called with the mocked activity value from HomeScreen — swap point
// for real Apple Health / Google Fit / Fitbit sync later (FR-1.1-1.3).
export async function setDayActivity(uid, dateKey, { caloriesBurned, steps } = {}) {
  const ref = doc(db, "users", uid, "logs", dateKey);
  const current = await getDayLog(uid, dateKey);
  await setDoc(
    ref,
    {
      date: dateKey,
      items: current.items || [],
      caloriesBurned: caloriesBurned ?? current.caloriesBurned ?? 0,
      steps: steps ?? current.steps ?? 0,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

// --- Favorite meals (FR-2.7) ---

export async function saveFavoriteMeal(uid, favorite) {
  const ref = doc(collection(db, "users", uid, "favorites"));
  const data = { id: ref.id, ...favorite, createdAt: new Date().toISOString() };
  await setDoc(ref, data);
  return data;
}

export async function getFavoriteMeals(uid) {
  const ref = collection(db, "users", uid, "favorites");
  const snap = await getDocs(ref);
  return snap.docs.map((d) => d.data());
}
