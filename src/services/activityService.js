// Real, on-device activity tracking — reads the phone's built-in step sensor
// (CMPedometer on iOS, hardware step-counter sensor on Android) via Expo's
// Pedometer API. No HealthKit/Health Connect entitlement needed, works inside
// Expo Go, and is the same underlying data source apps like Step Set Go use.
//
// IMPORTANT, and worth being upfront about: no phone or app actually *measures*
// calories burned — there is no sensor for that. Every step-counting app
// (including Step Set Go) *estimates* calories burned from steps using a
// formula based on stride length and body weight. We do the same here, openly,
// rather than implying a precision that doesn't exist.

import { Pedometer } from "expo-sensors";

const KCAL_PER_STEP_AT_70KG = 0.04;
const REFERENCE_WEIGHT_KG = 70;
const DEFAULT_WEIGHT_KG = 65;

// Average stride length in km — used to estimate distance from steps.
// Standard estimate: ~0.762m per step for average adult height.
const STRIDE_LENGTH_KM = 0.000762;

export async function isPedometerAvailable() {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function requestPedometerPermission() {
  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getTodayStepCount() {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const result = await Pedometer.getStepCountAsync(start, end);
    return result?.steps ?? 0;
  } catch {
    return 0;
  }
}

export function subscribeToStepUpdates(onUpdate) {
  return Pedometer.watchStepCount((result) => {
    onUpdate(result.steps);
  });
}

export function estimateCaloriesFromSteps(steps, weightKg = DEFAULT_WEIGHT_KG) {
  return Math.round(steps * KCAL_PER_STEP_AT_70KG * (weightKg / REFERENCE_WEIGHT_KG));
}

// Estimates distance in km from step count using average stride length.
// Same approach used by Google Fit, Samsung Health, etc.
export function estimateDistanceFromSteps(steps, heightCm = 170) {
  // Adjust stride length by height: taller people have longer strides.
  const heightFactor = heightCm / 170;
  const adjustedStride = STRIDE_LENGTH_KM * heightFactor;
  return Math.round(steps * adjustedStride * 100) / 100; // round to 2 decimals
}

export async function getTodayActivity(weightKg, heightCm) {
  const available = await isPedometerAvailable();
  if (!available) {
    return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };
  }
  const granted = await requestPedometerPermission();
  if (!granted) {
    return { steps: 0, caloriesBurned: 0, distanceKm: 0, available: false };
  }
  const steps = await getTodayStepCount();
  const caloriesBurned = estimateCaloriesFromSteps(steps, weightKg);
  const distanceKm = estimateDistanceFromSteps(steps, heightCm);
  return { steps, caloriesBurned, distanceKm, available: true };
}
