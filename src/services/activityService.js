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
export function calculateBMR(weightKg, heightCm, age, sex) {
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
export function caloriesForHour(steps, weightKg, heightCm, bmrPerHour, measuredSpeed_ms = null) {
  return bmrPerHour + movementPremium(steps, weightKg, heightCm, measuredSpeed_ms);
}

// Full 24h sum — the main model
export function calculateDayCalories(hourlySteps, weightKg, heightCm, age, sex) {
  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  const bmrPerHour = bmr / 24;

  const now = new Date();
  const currentHour = new Date().getHours();
  const currentMinutes = now.getMinutes();

  let total = 0;
  for (let h = 0; h <= currentHour; h++) {
    total += caloriesForHour(hourlySteps[h] || 0, weightKg, heightCm, bmrPerHour);
  }

// Handle the current hour proportionally by minutes
  const currentHourTotalPotential = caloriesForHour(hourlySteps[currentHour] || 0, weightKg, heightCm, bmrPerHour);
  const currentHourActiveComponent = currentHourTotalPotential - bmrPerHour;
  
  // Charge BMR only for the exact minutes passed + full movement premium earned
  const currentHourProportionalBmr = bmrPerHour * (currentMinutes / 60);
  total += currentHourProportionalBmr + currentHourActiveComponent;

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
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export async function getHourlySteps() {
  try {
    const savedDate = await AsyncStorage.getItem(STEPS_DATE_KEY);
    if (savedDate !== todayString()) {
      const fresh = [];
      for (let i = 0; i < 24; i++) fresh.push(0);
      await AsyncStorage.setItem(STEPS_DATE_KEY, todayString());
      await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(fresh));
      await AsyncStorage.setItem(STEPS_TOTAL_KEY, "0");
      return fresh;
    }
    const saved = await AsyncStorage.getItem(STEPS_HOURLY_KEY);
    if (saved) {
      return JSON.parse(saved);
    } else {
      const fresh = [];
      for (let i = 0; i < 24; i++) fresh.push(0);
      return fresh;
    }
  } catch (err) { 
    const fresh = [];
    for (let i = 0; i < 24; i++) fresh.push(0);
    return fresh;
  }
}

async function updateHourlySteps(totalSteps) {
  try {
    const today = todayString();
    const savedDate = await AsyncStorage.getItem(STEPS_DATE_KEY);
    let hourly = await getHourlySteps();

    // 1. If it's a new day, force a clean reset of everything
    if (savedDate !== today) {
      hourly = Array(24).fill(0);
      await AsyncStorage.setItem(STEPS_DATE_KEY, today);
      await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(hourly));
      await AsyncStorage.setItem(STEPS_TOTAL_KEY, String(totalSteps)); // Set baseline to current sensor count
      return hourly;
    }

    // 2. Retrieve the baseline steps we started the day with
    const baselineStr = await AsyncStorage.getItem(STEPS_TOTAL_KEY);
    const baselineSteps = baselineStr ? parseInt(baselineStr, 10) : totalSteps;

    // 3. Calculate steps actually taken TODAY
    const stepsToday = Math.max(0, totalSteps - baselineSteps);

    // 4. Calculate how many steps we need to distribute to the current hour
    const prevDistributed = hourly.reduce((a, b) => a + b, 0);
    const delta = Math.max(0, stepsToday - prevDistributed);

    if (delta === 0) return hourly;

    // 5. Add the delta steps to the current hour slot
    const h = new Date().getHours();
    hourly[h] = (hourly[h] || 0) + delta;

    // 6. Persist to storage
    await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(hourly));
    
    return hourly;
  } catch (err) { 
    console.error("Error updating hourly steps:", err);
    return Array(24).fill(0);
  }
}

async function getPersistedTotal() {
  try {
    const savedDate = await AsyncStorage.getItem(STEPS_DATE_KEY);
    if (savedDate !== todayString()) return 0;
    const saved = await AsyncStorage.getItem(STEPS_TOTAL_KEY);
    return saved ? parseInt(saved, 10) : 0;
  } catch (err) { return 0; }
}

/**
 * Saves raw hourly sync data (like from Google Fit) directly to AsyncStorage.
 * This completely bypasses the flat/uniform fallback distribution.
 * @param {number[]} hourlyArray - An array of 24 numbers representing steps per hour.
 */
export async function saveSyncedHourlySteps(hourlyArray) {
  try {
    if (!Array.isArray(hourlyArray) || hourlyArray.length !== 24) {
      throw new Error("Invalid hourly step array. Must be 24 elements.");
    }

    const totalSteps = hourlyArray.reduce((a, b) => a + b, 0);
    
    // Save everything cleanly under today's date key
    await AsyncStorage.setItem(STEPS_DATE_KEY, todayString());
    await AsyncStorage.setItem(STEPS_HOURLY_KEY, JSON.stringify(hourlyArray));
    await AsyncStorage.setItem(STEPS_TOTAL_KEY, String(totalSteps));
    
    console.log("✅ Successfully saved Google Fit hourly sync data to storage!", {
      totalSteps,
      hourlyArray
    });
    
    return { success: true, totalSteps, hourlySteps: hourlyArray };
  } catch (err) {
    console.error("❌ Failed to write Google Fit sync to AsyncStorage:", err);
    return { success: false, error: err.message };
  }
}

// iOS: reconstruct hourly breakdown from HealthKit hour-by-hour queries
async function buildHourlyFromiOS() {
  const hourly = [];
  for (let i = 0; i < 24; i++) hourly.push(0);
  
  const currentHour = new Date().getHours();
  for (let h = 0; h <= currentHour; h++) {
    const start = new Date(); start.setHours(h, 0, 0, 0);
    const end = new Date();   end.setHours(h, 59, 59, 999);
    if (end > new Date()) end.setTime(Date.now());
    try {
      const result = await Pedometer.getStepCountAsync(start, end);
      hourly[h] = result?.steps ?? 0;
    } catch (err) { hourly[h] = 0; }
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
  
  const hourly = [];
  for (let i = 0; i < 24; i++) hourly.push(0);
  
  // Spread steps across likely active hours (6am-10pm) proportionally
  const activeHours = 16;
  const stepsPerHour = Math.floor(steps / activeHours);
  for (let h = 6; h < 22; h++) hourly[h] = stepsPerHour;
  hourly[6] += steps - stepsPerHour * activeHours; // remainder added cleanly to index 6
  
  const totalWithBmr = calculateDayCalories(hourly, weightKg, heightCm, age, sex);
  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  
  // Active hours only account for a fraction of the daily BMR
  const currentHour = new Date().getHours();
  const activeBmrHours = Math.min(currentHour + 1, 24);
  const bmrFraction = (bmr / 24) * activeBmrHours;

  // Subtract the BMR baseline to get ONLY the calories burned from movement
  const netActive = Math.max(0, totalWithBmr - bmrFraction);
  return Math.round(netActive);
}

export async function isPedometerAvailable() {
  if (!isNative || !Pedometer) return false;
  try { return await Pedometer.isAvailableAsync(); }
  catch (err) { return false; }
}

export async function requestPedometerPermission() {
  if (!isNative || !Pedometer) return false;
  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    return status === "granted";
  } catch (err) { return false; }
}

export async function getTodayStepCount() {
  if (!isNative || !Pedometer) return 0;
  if (isIOS) {
    const end = new Date();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    try {
      const result = await Pedometer.getStepCountAsync(start, end);
      return result?.steps ?? 0;
    } catch (err) { return 0; }
  }
  return await getPersistedTotal();
}

let lastSyncedStepCount = 0;

/// Live subscription with dynamic speed from rolling window
export function subscribeToStepUpdates(onUpdate, baseSteps = 0, weightKg = 65, heightCm = 170, age = 30, sex = "male", userId = null) {
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
        const stepsPerHourRate = (stepDelta / timeSec) * 3600;
        const bucketData = classifyHour(stepsPerHourRate, heightCm);
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
    
    // Current hour uses measured speed from rolling window and minute proportion for BMR
    const liveHourTotal = caloriesForHour(hourlySteps[currentHour] || 0, weightKg, heightCm, bmrPerHour, measuredSpeed_ms);
    const liveHourActiveComponent = liveHourTotal - bmrPerHour;
    const liveHourProportionalBmr = bmrPerHour * (new Date().getMinutes() / 60);
    
    caloriesBurned = Math.round(caloriesBurned + liveHourProportionalBmr + liveHourActiveComponent);

    // Calculate precise elapsed BMR to isolate real active calories
    const preciseHoursElapsed = currentHour + (new Date().getMinutes() / 60);
    const totalBmrElapsed = bmrPerHour * preciseHoursElapsed;
    let activeCalories = Math.max(0, Math.round(caloriesBurned - totalBmrElapsed));

    // Fallback: If calculated active calories is <= 0 but they are actively taking steps,
    // fallback to step-based estimation so they do not see a flat 0.
    if (activeCalories <= 0 && totalSteps > 0) {
      activeCalories = Math.round(estimateCaloriesFromSteps(totalSteps, weightKg, heightCm, age, sex));
    }

    const distanceKm = estimateDistanceFromSteps(totalSteps, heightCm);

    // Pass the complete payload to the listener!
    onUpdate({ 
      totalSteps, 
      caloriesBurned, 
      activeCalories, 
      distanceKm,
      hourlySteps
    });

    // === NEW FIRESTORE BATCH SYNC ===
    // Sync to cloud if user is logged in and steps delta cross the 50 step boundary
    if (userId && hourlySteps) {
      if (Math.abs(totalSteps - lastSyncedStepCount) >= 50) {
        // Execute syncNativeActivityToFirestore we dropped at the bottom of the file
        syncNativeActivityToFirestore(userId, hourlySteps, { weightKg, heightCm, age, sex });
        lastSyncedStepCount = totalSteps;
      }
    }
    // ================================
  });

  return sub;
}

export async function getTodayActivity(weightKg = 65, heightCm = 170, age = 30, sex = "male") {
  if (!isNative || !Pedometer) {
    return { steps: 0, caloriesBurned: 0, activeCalories: 0, distanceKm: 0, available: false };
  }
  
  const available = await isPedometerAvailable();
  if (!available) return { steps: 0, caloriesBurned: 0, activeCalories: 0, distanceKm: 0, available: false };
  
  const granted = await requestPedometerPermission();
  if (!granted) return { steps: 0, caloriesBurned: 0, activeCalories: 0, distanceKm: 0, available: false };

  const steps = await getTodayStepCount();
  const hourlySteps = isIOS ? await buildHourlyFromiOS() : await getHourlySteps();
  
  // 1. Calculate total BMR + Activity calories
  const caloriesBurned = calculateDayCalories(hourlySteps, weightKg, heightCm, age, sex);
  
  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  const bmrPerHour = bmr / 24;
  const currentHour = new Date().getHours();
  const currentMinutes = new Date().getMinutes();
  
  const preciseHoursElapsed = currentHour + (currentMinutes / 60);
  const totalBmrElapsed = bmrPerHour * preciseHoursElapsed;
  let activeCalories = Math.max(0, Math.round(caloriesBurned - totalBmrElapsed));

  // 🌟 SAFETY FALLBACK: If active calories calculates as 0 but steps exist, use the estimator
  if (activeCalories <= 0 && steps > 0) {
    activeCalories = Math.round(estimateCaloriesFromSteps(steps, weightKg, heightCm, age, sex));
  }

  const distanceKm = estimateDistanceFromSteps(steps, heightCm);

  return { 
    steps, 
    caloriesBurned, 
    activeCalories, // ✅ Correctly fallback estimated on startup now!
    distanceKm, 
    available: true 
  };
}
import { saveActivityToFirestore } from '../config/firebase';

/**
 * Periodically backs up native iOS/Android step tracking metrics to Firestore
 * @param {string} userId - Unique ID of the authenticated user
 * @param {Array<number>} hourlySteps - The current 24-hour step distribution array
 * @param {object} profile - User baseline data containing weightKg, heightCm, age, sex
 */
export async function syncNativeActivityToFirestore(userId, hourlySteps, profile) {
  if (!userId || !hourlySteps) return;

  const weightKg = profile?.weightKg || 70;
  const heightCm = profile?.heightCm || 170;
  const age = profile?.age || 30;
  const sex = profile?.sex || "male";

  // 1. Calculate combined (BMR + Activity) from the current native hourly step array
  const computedCalories = calculateDayCalories(hourlySteps, weightKg, heightCm, age, sex);
  
  // 2. Isolate Active Calories by subtracting precise elapsed BMR down to the minute
  const bmr = calculateBMR(weightKg, heightCm, age, sex);
  const bmrPerHour = bmr / 24;
  
  const currentDate = new Date();
  const preciseHoursElapsed = currentDate.getHours() + (currentDate.getMinutes() / 60);
  const totalBmrElapsed = bmrPerHour * preciseHoursElapsed;
  const actualActiveCalories = Math.round(Math.max(0, computedCalories - totalBmrElapsed));

  // 3. Compute structural sums
  const totalSteps = hourlySteps.reduce((a, b) => a + b, 0);
  const STRIDE_LENGTH_KM = 0.000762;
  const heightFactor = heightCm / 170;
  const totalDistanceKm = Math.round(totalSteps * STRIDE_LENGTH_KM * heightFactor * 100) / 100;

  const activityPayload = {
    steps: totalSteps,
    caloriesBurned: computedCalories,
    activeCalories: actualActiveCalories,
    distanceKm: totalDistanceKm,
    hourlySteps: hourlySteps // This maps cleanly to the Firestore array payload
  };

  try {
    await saveActivityToFirestore(userId, activityPayload);
    console.log("Successfully mirrored native physical steps to Firestore logs.");
  } catch (error) {
    console.error("Native Firestore sync cycle failed silently:", error);
  }
}