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

// Average calories burned per step, scaled by body weight. This mirrors the
// standard industry estimation formula (the same one used by mainstream
// step-counting apps): roughly 0.04 kcal per step for a 70kg person, scaling
// linearly with weight — i.e. calories ≈ steps × 0.04 × (weight_kg / 70).
const KCAL_PER_STEP_AT_70KG = 0.04;
const REFERENCE_WEIGHT_KG = 70;
const DEFAULT_WEIGHT_KG = 65; // fallback if profile weight isn't set yet

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

// Steps since midnight today, read directly from the device sensor.
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

// Live subscription — call the returned unsubscribe function (e.g. in a
// useEffect cleanup) when done. delta.steps is the count since subscribing,
// so callers should add it to the steps already read via getTodayStepCount().
export function subscribeToStepUpdates(onUpdate) {
  return Pedometer.watchStepCount((result) => {
    onUpdate(result.steps);
  });
}

// Estimates calories burned from a real step count + the user's weight from
// onboarding. This is the same approach Step Set Go and similar apps use —
// steps are real (sensor-measured), calories are a standard estimate.
export function estimateCaloriesFromSteps(steps, weightKg = DEFAULT_WEIGHT_KG) {
  return Math.round(steps * KCAL_PER_STEP_AT_70KG * (weightKg / REFERENCE_WEIGHT_KG));
}

// Convenience: does both reads + the calorie estimate in one call, for use on
// screen load. Returns { steps, caloriesBurned, available }.
export async function getTodayActivity(weightKg) {
  const available = await isPedometerAvailable();
  if (!available) {
    return { steps: 0, caloriesBurned: 0, available: false };
  }
  const granted = await requestPedometerPermission();
  if (!granted) {
    return { steps: 0, caloriesBurned: 0, available: false };
  }
  const steps = await getTodayStepCount();
  const caloriesBurned = estimateCaloriesFromSteps(steps, weightKg);
  return { steps, caloriesBurned, available: true };
}
