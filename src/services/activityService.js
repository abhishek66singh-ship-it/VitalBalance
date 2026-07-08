import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const isAndroid = Platform.OS === "android";
const isIOS = Platform.OS === "ios";

let Pedometer = null;
if (isNative) {
  Pedometer = require("expo-sensors").Pedometer;
}

const KCAL_PER_STEP_AT_70KG = 0.04;
const REFERENCE_WEIGHT_KG = 70;
const DEFAULT_WEIGHT_KG = 65;
const STRIDE_LENGTH_KM = 0.000762;

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

export function subscribeToStepUpdates(onUpdate, baseSteps = 0) {
  if (!isNative || !Pedometer) return { remove: () => {} };
  const sub = Pedometer.watchStepCount(async (result) => {
    const totalSteps = baseSteps + result.steps;
    if (isAndroid) { await persistSteps(totalSteps); }
    onUpdate(totalSteps);
  });
  return sub;
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
