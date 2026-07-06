import { Platform } from "react-native";

// expo-sensors Pedometer only works on iOS/Android — not in a web browser.
// All functions return safe zero/false values on web so the app renders
// correctly without crashing.
const isNative = Platform.OS === "ios" || Platform.OS === "android";

let Pedometer = null;
if (isNative) {
  Pedometer = require("expo-sensors").Pedometer;
}

const KCAL_PER_STEP_AT_70KG = 0.04;
const REFERENCE_WEIGHT_KG = 70;
const DEFAULT_WEIGHT_KG = 65;
const STRIDE_LENGTH_KM = 0.000762;

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
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const result = await Pedometer.getStepCountAsync(start, end);
    return result?.steps ?? 0;
  } catch { return 0; }
}

export function subscribeToStepUpdates(onUpdate) {
  if (!isNative || !Pedometer) return { remove: () => {} };
  return Pedometer.watchStepCount((result) => { onUpdate(result.steps); });
}

export function estimateCaloriesFromSteps(steps, weightKg = DEFAULT_WEIGHT_KG) {
  return Math.round(steps * KCAL_PER_STEP_AT_70KG * (weightKg / REFERENCE_WEIGHT_KG));
}

export function estimateDistanceFromSteps(steps, heightCm = 170) {
  const heightFactor = heightCm / 170;
  const adjustedStride = STRIDE_LENGTH_KM * heightFactor;
  return Math.round(steps * adjustedStride * 100) / 100;
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
  const caloriesBurned = estimateCaloriesFromSteps(steps, weightKg);
  const distanceKm = estimateDistanceFromSteps(steps, heightCm);
  return { steps, caloriesBurned, distanceKm, available: true };
}
