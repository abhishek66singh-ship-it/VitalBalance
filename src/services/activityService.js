import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const isAndroid = Platform.OS === "android";
const isIOS = Platform.OS === "ios";

let Pedometer = null;
if (isNative) {
  Pedometer = require("expo-sensors").Pedometer;
}

const STRIDE_LENGTH_KM = 0.000762;
const DEFAULT_WEIGHT_KG = 65;

// MET values from Compendium of Physical Activities (standard reference)
function getMET(speedKmh) {
  if (speedKmh < 3) return 2.0;    // very slow / standing
  if (speedKmh < 4.5) return 2.8;  // slow walk
  if (speedKmh < 5.5) return 3.5;  // normal walk
  if (speedKmh < 7) return 4.3;    // brisk walk
  if (speedKmh < 9) return 7.0;    // light jog
  if (speedKmh < 11) return 10.5;  // running
  return 12.5;                      // fast running
}

// Calorie estimation using MET × weight × duration.
// For Android we track step rate over a rolling 5-minute window to detect
// if the user is walking vs jogging vs running, then apply appropriate MET.
// stepRate: steps per minute (from rolling window)
export function estimateCaloriesFromStepRate(steps, weightKg = DEFAULT_WEIGHT_KG, stepRatePerMin = null, durationHours = null) {
  if (steps === 0) return 0;

  let speedKmh;

  if (stepRatePerMin !== null && stepRatePerMin > 0) {
    // Convert step rate to speed: steps/min × stride_km × 60 = km/h
    speedKmh = stepRatePerMin * STRIDE_LENGTH_KM * 60;
  } else if (durationHours !== null && durationHours > 0) {
    // Fallback: use total steps and total duration
    const distanceKm = steps * STRIDE_LENGTH_KM;
    speedKmh = distanceKm / durationHours;
  } else {
    // No timing info — assume average walking pace
    speedKmh = 4.5;
  }

  const met = getMET(speedKmh);
  const hours = durationHours || (steps / (stepRatePerMin || 80) / 60);
  return Math.round(met * weightKg * Math.max(hours, 0.01));
}

// Simple version for one-shot calculation (used in getTodayActivity)
export function estimateCaloriesFromSteps(steps, weightKg = DEFAULT_WEIGHT_KG, durationHours = null) {
  return estimateCaloriesFromStepRate(steps, weightKg, null, durationHours);
}

export function estimateDistanceFromSteps(steps, heightCm = 170) {
  const heightFactor = heightCm / 170;
  return Math.round(steps * STRIDE_LENGTH_KM * heightFactor * 100) / 100;
}

function getDurationHoursSinceMidnight() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return (now.getTime() - midnight.getTime()) / 3600000;
}

// ---- Android step persistence ----
const STEPS_DATE_KEY = "vb_steps_date";
const STEPS_TOTAL_KEY = "vb_steps_total";

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getPersistedSteps() {
  try {
    const savedDate = await AsyncStorage.getItem(STEPS_DATE_KEY);
    const today = todayString();
    if (savedDate !== today) {
      await AsyncStorage.setItem(STEPS_DATE_KEY, today);
      await AsyncStorage.setItem(STEPS_TOTAL_KEY, "0");
      return 0;
    }
    const saved = await AsyncStorage.getItem(STEPS_TOTAL_KEY);
    return saved ? parseInt(saved, 10) : 0;
  } catch { return 0; }
}

async function persistSteps(steps) {
  try {
    await AsyncStorage.setItem(STEPS_DATE_KEY, todayString());
    await AsyncStorage.setItem(STEPS_TOTAL_KEY, String(steps));
  } catch {}
}

export async function isPedometerAvailable() {
  if (!isNative || !Pedometer) return false;
  try { return await Pedometer.isAvailableAsync(); }
  catch { return false; }
}

export async function requestPedometerPermission() {
  if (!isNative || !Pedometer) return false;
  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    return status === "granted";
  } catch { return false; }
}

export async function getTodayStepCount() {
  if (!isNative || !Pedometer) return 0;
  if (isIOS) {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    try {
      const result = await Pedometer.getStepCountAsync(start, end);
      return result?.steps ?? 0;
    } catch { return 0; }
  }
  return await getPersistedSteps();
}

// Subscribe to live step updates.
// onUpdate receives: { totalSteps, stepRatePerMin, caloriesBurned, distanceKm }
// Step rate is measured over a rolling 60-second window to detect
// walk vs jog vs run and apply the right MET for calorie calc.
export function subscribeToStepUpdates(onUpdate, baseSteps = 0, weightKg = DEFAULT_WEIGHT_KG, heightCm = 170) {
  if (!isNative || !Pedometer) return { remove: () => {} };

  // Rolling window to track step rate
  const WINDOW_MS = 60000; // 60-second window for speed detection
  const stepHistory = []; // [{ steps, time }]

  const sub = Pedometer.watchStepCount(async (result) => {
    const now = Date.now();
    const totalSteps = baseSteps + result.steps;

    // Add to rolling history
    stepHistory.push({ steps: totalSteps, time: now });

    // Remove entries older than window
    while (stepHistory.length > 1 && now - stepHistory[0].time > WINDOW_MS) {
      stepHistory.shift();
    }

    // Calculate step rate from rolling window
    let stepRatePerMin = null;
    if (stepHistory.length >= 2) {
      const oldest = stepHistory[0];
      const newest = stepHistory[stepHistory.length - 1];
      const stepDelta = newest.steps - oldest.steps;
      const timeDeltaMin = (newest.time - oldest.time) / 60000;
      if (timeDeltaMin > 0) {
        stepRatePerMin = stepDelta / timeDeltaMin;
      }
    }

    const durationHours = getDurationHoursSinceMidnight();
    const caloriesBurned = estimateCaloriesFromStepRate(totalSteps, weightKg, stepRatePerMin, durationHours);
    const distanceKm = estimateDistanceFromSteps(totalSteps, heightCm);

    if (isAndroid) { await persistSteps(totalSteps); }

    onUpdate({ totalSteps, stepRatePerMin, caloriesBurned, distanceKm });
  });

  return sub;
}

export async function getTodayActivity(weightKg, heightCm) {
  if (!isNative || !Pedometer) {
    return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };
  }
  const available = await isPedometerAvailable();
  if (!available) return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };
  const granted = await requestPedometerPermission();
  if (!granted) return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };

  const steps = await getTodayStepCount();
  const durationHours = getDurationHoursSinceMidnight();
  const caloriesBurned = estimateCaloriesFromSteps(steps, weightKg, durationHours);
  const distanceKm = estimateDistanceFromSteps(steps, heightCm);
  return { steps, caloriesBurned, distanceKm, available: true };
}
