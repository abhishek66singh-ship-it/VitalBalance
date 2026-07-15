import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const isAndroid = Platform.OS === "android";
const isIOS = Platform.OS === "ios";

let Pedometer = null;
if (isNative) {
  Pedometer = require("expo-sensors").Pedometer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 24-HOUR INTERVAL MODEL
// C_i = BMR_hour + Movement_Premium_i for each hour i
// Movement Premium uses Net MET applied only to actual moving minutes.
// Speed and stride length are dynamically estimated from expanded step-count 
// brackets when no live window is available, falling back to bucket defaults.
// ─────────────────────────────────────────────────────────────────────────────

// Mifflin-St Jeor BMR (kcal/day)
function calculateBMR(weightKg, heightCm, age, sex) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/**
 * Classifies an hour of activity into granular intensity brackets.
 * Calculates dynamic speed, METs, and stride length based on hourly step volume.
 * Stride ratios are adjusted dynamically relative to height based on physical intensity.
 */
function classifyHour(steps, heightCm = 170) {
  const heightM = heightCm / 100;

  if (steps === 0) {
    return { speed_ms: 0, netMet: 0, strideM: 0, label: "Rest" };
  }
  
  // 1. Minimal Shuffling (Short, hesitant paces)
  if (steps < 300) {
    return { speed_ms: 0.6, netMet: 0.5, strideM: heightM * 0.35, label: "Minimal Incidental" };
  }
  
  // 2. Household Mobility (Slightly larger but still casual indoor paces)
  if (steps < 1000) {
    return { speed_ms: 0.8, netMet: 1.0, strideM: heightM * 0.38, label: "Incidental Activity" };
  }
  
  // 3. Casual Walking (Standard Grieve & Gear baseline)
  if (steps < 2500) {
    return { speed_ms: 1.0, netMet: 1.5, strideM: heightM * 0.414, label: "Casual Walking" };
  }
  
  // 4. Steady Walking (Purposeful, slightly elongated strides)
  if (steps < 4500) {
    return { speed_ms: 1.25, netMet: 2.0, strideM: heightM * 0.43, label: "Steady Walking" };
  }
  
  // 5. Brisk Fitness Walking (Active power-walking stride)
  if (steps < 6500) {
    return { speed_ms: 1.45, netMet: 3.0, strideM: heightM * 0.45, label: "Brisk Walking" };
  }
  
  // 6. Very Fast Walking / Slow Jogging Hybrid
  if (steps < 8500) {
    return { speed_ms: 1.8, netMet: 4.5, strideM: heightM * 0.52, label: "Very High Intensity Walk/Jog" };
  }
  
  // 7. Running (Dramatically elongated stride due to high momentum)
  return { speed_ms: 2.5, netMet: 7.0, strideM: heightM * 0.65, label: "Running" };
}

// Net MET from measured or default speed
function netMetFromSpeed(speedMs) {
  const kmh = speedMs * 3.6;
  if (kmh < 1)   return 0;
  if (kmh < 4)   return 1.0;
  if (kmh < 5.5) return 1.5;
  if (kmh < 7)   return 2.3;
  if (kmh < 9)   return 6.0;
  if (kmh < 11)  return 9.5;
  return 11.5;
}

// Movement premium for one hour (kcal above BMR)
// Only charges for minutes actually walking — rest of the hour stays at BMR
function movementPremium(steps, weightKg, heightCm, measuredSpeed_ms = null) {
  if (steps === 0) return 0;

  // Fetch dynamic constants and stride length from the new bucket function
  const bucketData = classifyHour(steps, heightCm);
  const distanceM = steps * bucketData.strideM;

  // Use dynamic speed if measured, else bucket default
  const effectiveSpeed = (measuredSpeed_ms && measuredSpeed_ms > 0)
    ? measuredSpeed_ms
    : bucketData.speed_ms;

  if (effectiveSpeed === 0) return 0;

  const tMovingMin = distanceM / (effectiveSpeed * 60); // actual walking minutes
  const netMet = measuredSpeed_ms
    ? netMetFromSpeed(measuredSpeed_ms)
    : bucketData.netMet;

  // Net MET formula: only moving minutes charged above BMR
  return (netMet * 3.5 * weightKg / 200) * tMovingMin;
}

// Total calories for one hour
function caloriesForHour(steps, weightKg, heightCm, bmrPerHour, measuredSpeed_ms = null) {
  return bmrPerHour + movementPremium(steps, weightKg, heightCm, measuredSpeed_ms);
}

// Full 24h sum — the main model
export function calculateDayCalories(hourlySteps, weightKg, heightCm, age, sex) {
  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  const bmrPerHour = bmr / 24;
  const currentHour = new Date().getHours();
  let total = 0;
  for (let h = 0; h <= currentHour; h++) {
    total += caloriesForHour(hourlySteps[h] || 0, weightKg, heightCm, bmrPerHour);
  }
  return Math.round(total);
}

// ─────────────────────────────────────────────────────────────────────────────
// HOURLY STEP BUCKETS — persisted to AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────

const STEPS_DATE_KEY = "vb_steps_date";
const STEPS_HOURLY_KEY = "vb_steps_hourly";
const STEPS_TOTAL_KEY = "vb_steps_total";

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getHourlySteps() {
  try {
    const savedDate = await AsyncStorage.getItem(STEPS_DATE_KEY);
    if (savedDate !== todayString()) {
      const fresh = new Array(24).fill(0);
      await AsyncStorage.setItem(STEPS_DATE_KEY, todayString());
      await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(fresh));
      await AsyncStorage.setItem(STEPS_TOTAL_KEY, "0");
      return fresh;
    }
    const saved = await AsyncStorage.getItem(STEPS_HOURLY_KEY);
    return saved ? JSON.parse(saved) : new Array(24).fill(0);
  } catch { return new Array(24).fill(0); }
}

async function updateHourlySteps(totalSteps) {
  try {
    const hourly = await getHourlySteps();
    const prevTotal = hourly.reduce((a, b) => a + b, 0);
    const delta = Math.max(0, totalSteps - prevTotal);
    if (delta === 0) return hourly;
    const h = new Date().getHours();
    hourly[h] = (hourly[h] || 0) + delta;
    await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(hourly));
    await AsyncStorage.setItem(STEPS_TOTAL_KEY, String(totalSteps));
    return hourly;
  } catch { return new Array(24).fill(0); }
}

async function getPersistedTotal() {
  try {
    const savedDate = await AsyncStorage.getItem(STEPS_DATE_KEY);
    if (savedDate !== todayString()) return 0;
    const saved = await AsyncStorage.getItem(STEPS_TOTAL_KEY);
    return saved ? parseInt(saved, 10) : 0;
  } catch { return 0; }
}

// iOS: reconstruct hourly breakdown from HealthKit hour-by-hour queries
async function buildHourlyFromiOS() {
  const hourly = new Array(24).fill(0);
  const currentHour = new Date().getHours();
  for (let h = 0; h <= currentHour; h++) {
    const start = new Date(); start.setHours(h, 0, 0, 0);
    const end = new Date();   end.setHours(h, 59, 59, 999);
    if (end > new Date()) end.setTime(Date.now());
    try {
      const result = await Pedometer.getStepCountAsync(start, end);
      hourly[h] = result?.steps ?? 0;
    } catch { hourly[h] = 0; }
  }
  await AsyncStorage.setItem(STEPS_DATE_KEY, todayString());
  await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(hourly));
  return hourly;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function estimateDistanceFromSteps(steps, heightCm = 170) {
  const strideM = (heightCm / 100) * 0.414;
  return Math.round(steps * strideM / 1000 * 100) / 100;
}

// Simple estimate when no hourly data (e.g. web fallback)
export function estimateCaloriesFromSteps(steps, weightKg = 65, heightCm = 170, age = 30, sex = "male") {
  if (steps === 0) return 0;
  const hourly = new Array(24).fill(0);
  // Spread steps across likely active hours (6am-10pm) proportionally
  const activeHours = 16;
  const stepsPerHour = Math.floor(steps / activeHours);
  for (let h = 6; h < 22; h++) hourly[h] = stepsPerHour;
  hourly[6] += steps - stepsPerHour * activeHours; // remainder added cleanly to index 6
  return calculateDayCalories(hourly, weightKg, heightCm, age, sex);
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
    const start = new Date(); start.setHours(0, 0, 0, 0);
    try {
      const result = await Pedometer.getStepCountAsync(start, end);
      return result?.steps ?? 0;
    } catch { return 0; }
  }
  return await getPersistedTotal();
}
// Live subscription with dynamic speed from rolling window
export function subscribeToStepUpdates(onUpdate, baseSteps = 0, weightKg = 65, heightCm = 170, age = 30, sex = "male") {
  if (!isNative || !Pedometer) return { remove: () => {} };

  const WINDOW_MS = 60000; // 60-second rolling window for speed
  const stepHistory = [];

  const sub = Pedometer.watchStepCount(async (result) => {
    const now = Date.now();
    const totalSteps = baseSteps + result.steps;

    // Rolling window cleanup
    stepHistory.push({ steps: totalSteps, time: now });
    while (stepHistory.length > 1 && (now - stepHistory[0].time) > WINDOW_MS) {
      stepHistory.shift();
    }

    // Dynamic speed from window (distance/time — using upgraded step brackets)
    let measuredSpeed_ms = null;
    if (stepHistory.length >= 2) {
      const oldest = stepHistory[0];
      const newest = stepHistory[stepHistory.length - 1];
      const stepDelta = newest.steps - oldest.steps;
      const timeSec = (newest.time - oldest.time) / 1000;
      
      if (timeSec > 0 && stepDelta > 5) {
        // Estimate stride length dynamically using the cadence/step intensity inside the live window
        const bucketData = classifyHour(stepDelta, heightCm);
        const strideM = bucketData.strideM > 0 ? bucketData.strideM : (heightCm / 100) * 0.414;
        measuredSpeed_ms = (stepDelta * strideM) / timeSec;
      }
    }

    // Update hourly buckets
    const hourlySteps = await updateHourlySteps(totalSteps);

    // Full 24h model with measured speed for current hour
    const bmr = calculateBMR(weightKg, heightCm, age, sex);
    const bmrPerHour = bmr / 24;
    const currentHour = new Date().getHours();
    let caloriesBurned = 0;
    
    for (let h = 0; h < currentHour; h++) {
      caloriesBurned += caloriesForHour(hourlySteps[h] || 0, weightKg, heightCm, bmrPerHour);
    }
    
    // Current hour uses measured speed from rolling window
    caloriesBurned += caloriesForHour(
      hourlySteps[currentHour] || 0,
      weightKg, heightCm, bmrPerHour, measuredSpeed_ms
    );
    caloriesBurned = Math.round(caloriesBurned);

    const distanceKm = estimateDistanceFromSteps(totalSteps, heightCm);
    onUpdate({ totalSteps, caloriesBurned, distanceKm });
  });

  return sub;
}

export async function getTodayActivity(weightKg = 65, heightCm = 170, age = 30, sex = "male") {
  if (!isNative || !Pedometer) {
    return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };
  }
  const available = await isPedometerAvailable();
  if (!available) return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };
  const granted = await requestPedometerPermission();
  if (!granted) return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };

  const steps = await getTodayStepCount();
  const hourlySteps = isIOS ? await buildHourlyFromiOS() : await getHourlySteps();
  const caloriesBurned = calculateDayCalories(hourlySteps, weightKg, heightCm, age, sex);
  const distanceKm = estimateDistanceFromSteps(steps, heightCm);
  return { steps, caloriesBurned, distanceKm, available: true };
}
