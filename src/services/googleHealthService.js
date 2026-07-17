const FITNESS_SCOPES = "https://www.googleapis.com/auth/fitness.activity.read";
const STRIDE_LENGTH_KM = 0.000762;

// Added saveSyncedHourlySteps here so it saves directly to AsyncStorage on sync
import { calculateDayCalories, calculateBMR, saveSyncedHourlySteps } from './activityService';
import { saveActivityToFirestore } from '../config/firebase';

export function isHealthSyncAvailable(userEmail) {
  return true;
}

export function buildGoogleFitnessAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: FITNESS_SCOPES,
    include_granted_scopes: "true",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function fetchGoogleFitnessToday(accessToken, weightKg = 70, heightCm = 170, age = 30, sex = "male", userId = null) {
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const startMs = midnight.getTime();
  const currentHour = new Date().getHours();

  const hourlySteps = new Array(24).fill(0);
  let totalSteps = 0;

  try {
    const body = {
      aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
      bucketByTime: { durationMillis: 3600000 }, // 1 Hour buckets
      startTimeMillis: startMs,
      endTimeMillis: now,
    };

    const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      (data.bucket || []).forEach((bucket, idx) => {
        if (idx < 24) {
          let bucketSteps = 0;
          (bucket.dataset || []).forEach(dataset => {
            (dataset.point || []).forEach(point => {
              bucketSteps += point.value?.[0]?.intVal || 0;
            });
          });
          hourlySteps[idx] = bucketSteps;
          totalSteps += bucketSteps;
        }
      });
    }
  } catch (err) {
    console.error("Failed to query hourly step buckets from Google Fit:", err);
  }

  // Fallback if aggregate failed
  if (totalSteps === 0) {
    try {
      const startNs = startMs * 1000000;
      const endNs = now * 1000000;
      const dataSourceId = "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps";
      const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(dataSourceId)}/datasets/${startNs}-${endNs}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        let total = 0;
        for (const point of data.point || []) {
          total += point.value?.[0]?.intVal || 0;
        }
        totalSteps = total;
        if (total > 0) {
          const hoursActive = Math.max(1, currentHour);
          const split = Math.round(total / hoursActive);
          for (let i = 0; i <= currentHour; i++) {
            hourlySteps[i] = split;
          }
        }
      }
    } catch {}
  }

// 1. Calculate combined (BMR + Activity) from ACTUAL hourly steps
  const computedCalories = calculateDayCalories(hourlySteps, weightKg, heightCm, age, sex);
  
  // 2. Isolate ACTUAL Active Calories by subtracting the precise BMR elapsed down to the minute
  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  const bmrPerHour = bmr / 24;
  
  // FIX: Use a unique variable name (currentDate) to avoid crashing Babel
  const currentDate = new Date(); 
  const preciseHoursElapsed = currentDate.getHours() + (currentDate.getMinutes() / 60);
  const totalBmrElapsed = bmrPerHour * preciseHoursElapsed;
  const actualActiveCalories = Math.round(Math.max(0, computedCalories - totalBmrElapsed));

  // 🔴 NEW FIX: Persist the synced hourly steps array straight to AsyncStorage
  // This guarantees that any subsequent app render or database read gets the 
  // accurate hourly details instead of the flat, spread-out fallback.
  try {
    await saveSyncedHourlySteps(hourlySteps);
  } catch (storageErr) {
    console.error("Failed to persist synced hourly steps to AsyncStorage:", storageErr);
  }

  const heightFactor = heightCm / 170;
  const totalDistanceKm = Math.round(totalSteps * STRIDE_LENGTH_KM * heightFactor * 100) / 100;

  const activityPayload = {
    steps: totalSteps,
    caloriesBurned: computedCalories,
    activeCalories: actualActiveCalories, // Actual calculation based on real hourly steps!
    distanceKm: totalDistanceKm,
    hourlySteps
  };

  // === ADD TO THE BOTTOM OF THE FUNCTION ===
  try {
    if (userId) {
      await saveActivityToFirestore(userId, activityPayload);
      console.log("Successfully backed up active metrics to Firestore cloud storage.");
    }
  } catch (firestoreError) {
    console.error("Failed to back up data to Firestore:", firestoreError);
  }
  // =========================================

  // Save locally to AsyncStorage as backup
  await saveSyncedHourlySteps(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`, hourlySteps);

  return activityPayload;
}

export function saveAccessToken(token) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("vb_fitness_token", token);
    sessionStorage.setItem("vb_fitness_token_time", Date.now().toString());
  }
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem("vb_fitness_token");
  const time = parseInt(sessionStorage.getItem("vb_fitness_token_time") || "0");
  if (Date.now() - time > 55 * 60 * 1000) {
    sessionStorage.removeItem("vb_fitness_token");
    return null;
  }
  return token || null;
}

export function clearAccessToken() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("vb_fitness_token");
    sessionStorage.removeItem("vb_fitness_token_time");
  }
}

export function parseTokenFromUrl() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.substring(1));
  const token = params.get("access_token");
  if (token) {
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return null;
}