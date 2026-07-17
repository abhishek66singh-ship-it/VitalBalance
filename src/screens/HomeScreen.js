import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Flame, Footprints, Droplet, Plus, Sparkles, Coffee, TrendingUp, MapPin, Target, Apple } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { getDayLog, todayKey, getRecentLogs, setDayActivity } from "../services/logService";
import { 
  getTodayActivity, 
  getHourlySteps, // FIXED IMPORT (was lowercase 'gethourlysteps' in import, but used as 'getHourlySteps' later)
  syncNativeActivityToFirestore, 
  estimateCaloriesFromSteps, 
  isPedometerAvailable, 
  getTodayStepCount, 
  subscribeToStepUpdates 
} from "../services/activityService";
import { fetchGoogleFitnessToday, getAccessToken } from '../services/googleHealthService';
import { generateInsights } from "../services/aiCoach";
import { generateMorningBrief } from "../services/morningBriefEngine";
import { MEAL_TYPES, MEAL_LABELS } from "../data/foodLibrary";
import { theme } from "../theme";
import ProgressRing from "../components/ProgressRing";
import MorningBriefHero from "../components/MorningBriefHero";

const INSIGHT_ICONS = {
  pattern: Coffee, nudge: Coffee, deviation: TrendingUp,
  macro_gap: Sparkles, positive: Flame, safety_fallback: Sparkles, activity_nudge: Footprints,
};

export default function HomeScreen({ navigation }) {
  const { user, profile } = useAuth();
  const [todayItems, setTodayItems] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [activity, setActivity] = useState({ caloriesBurned: 0, activeCalories: 0, steps: 0, distanceKm: 0 });
  const [pedometerAvailable, setPedometerAvailable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const isInitialMount = useRef(true);

  const load = useCallback(async () => {
    if (!user) return;
    const key = todayKey();
    const weightKg = profile?.weightKg || 70;
    const heightCm = profile?.heightCm || 170;
    const age = profile?.age || 25;
    const sex = profile?.sex || "male";

    const liveActivity = await getTodayActivity(weightKg, heightCm, age, sex);
    setPedometerAvailable(liveActivity.available);
    
    if (liveActivity.available) {
      if (isInitialMount.current) {
        await setDayActivity(user.uid, key, {
          steps: liveActivity.steps,
          caloriesBurned: liveActivity.caloriesBurned,
          activeCalories: liveActivity.activeCalories, 
          distanceKm: liveActivity.distanceKm,
        });
      }
    } else {
      const token = getAccessToken();
      if (token) {
        try {
          const webSync = await fetchGoogleFitnessToday(token, weightKg, heightCm, age, sex);
          if (webSync.steps > 0 || webSync.caloriesBurned > 150) {
            liveActivity.steps = webSync.steps;
            liveActivity.caloriesBurned = webSync.caloriesBurned;
            liveActivity.distanceKm = webSync.distanceKm;
            liveActivity.activeCalories = webSync.activeCalories; 
            
            if (isInitialMount.current) {
              await setDayActivity(user.uid, key, {
                steps: webSync.steps,
                caloriesBurned: webSync.caloriesBurned,
                activeCalories: webSync.activeCalories,
                distanceKm: webSync.distanceKm,
              });
            }
          }
        } catch (syncErr) {
          console.log("Background sync skipped:", syncErr);
        }
      }
    }
    
    const [day, recent] = await Promise.all([
      getDayLog(user.uid, key),
      getRecentLogs(user.uid, 7),
    ]);
    
    setTodayItems(day.items || []);
    setRecentLogs(recent);
    
    const currentSteps = liveActivity.available ? liveActivity.steps : (day.steps ?? 0);
    
    // Calculate active calories directly from steps if the current value is stuck or invalid
    let calculatedActive = liveActivity.activeCalories || day.activeCalories || 0;
    if (calculatedActive <= 5 && currentSteps > 100) {
      calculatedActive = Math.round(estimateCaloriesFromSteps(currentSteps, weightKg, heightCm, age, sex));
    }
    
    setActivity({
      steps: currentSteps,
      caloriesBurned: liveActivity.available ? liveActivity.caloriesBurned : (day.caloriesBurned ?? 732),
      activeCalories: calculatedActive,
      distanceKm: liveActivity.available ? liveActivity.distanceKm : (day.distanceKm ?? 0),
    });
    
    isInitialMount.current = false;
  }, [user?.uid, profile?.weightKg, profile?.heightCm, profile?.age, profile?.sex]);

  useFocusEffect(
    useCallback(() => { 
      load(); 
    }, [load])
  );

  useEffect(() => {
    if (!user) return;
    let sub = null;
    let currentCalculatedData = null;
    
    const startSubscription = async () => {
      const available = await isPedometerAvailable();
      if (!available) return;
      const base = await getTodayStepCount();
      
      try {
        const initialHourly = await getHourlySteps();
        if (initialHourly && initialHourly.length > 0) {
          await setDayActivity(user.uid, todayKey(), {
            steps: base,
            hourlySteps: initialHourly
          });
        }
      } catch (e) {
        console.log("Initial database sync failed: ", e);
      }

      sub = subscribeToStepUpdates((calculatedData) => {
        currentCalculatedData = calculatedData;
        
        const { totalSteps, caloriesBurned, activeCalories, distanceKm, hourlySteps } = calculatedData;
        
        let liveActive = activeCalories;
        if ((!liveActive || liveActive <= 5) && totalSteps > 100) {
          liveActive = Math.round(
            estimateCaloriesFromSteps(
              totalSteps, 
              profile?.weightKg || 70, 
              profile?.heightCm || 170, 
              profile?.age || 25, 
              profile?.sex || 'male'
            )
          );
        }

        setActivity({ 
          steps: totalSteps, 
          caloriesBurned: caloriesBurned || 732, 
          activeCalories: liveActive, 
          distanceKm 
        });

        console.log("HOURLY ARRAY:", hourlySteps);

        setDayActivity(user.uid, todayKey(), { 
          steps: totalSteps, 
          caloriesBurned: caloriesBurned || 732, 
          activeCalories: liveActive,
          distanceKm,
          hourlySteps: hourlySteps || []
        }).catch(() => {});
        
      }, base, profile?.weightKg || 70, profile?.heightCm || 170, profile?.age || 25, profile?.sex || 'male', user.uid);
    };

    startSubscription();
    
    return () => {
      if (user?.uid && currentCalculatedData) {
        getHourlySteps().then((hourlyStepsArray) => {
          if (hourlyStepsArray) {
            syncNativeActivityToFirestore(user.uid, hourlyStepsArray, profile);
          }
        }).catch(() => {});
      }

      if (sub && typeof sub.remove === "function") {
        sub.remove();
      }
    };
  }, [user?.uid, profile?.weightKg, profile?.heightCm, profile?.age, profile?.sex]);
  
  async function onRefresh() { 
    setRefreshing(true); 
    isInitialMount.current = true;
    await load(); 
    setRefreshing(false); 
  }

  // Fallback defaults to ensure no mathematical operations result in NaN
  const consumed = Math.round(todayItems.reduce((s, i) => s + (i.kcal || 0), 0)) || 0;
  const protein = Math.round(todayItems.reduce((s, i) => s + (i.proteinG || 0), 0)) || 0;
  const carbs = Math.round(todayItems.reduce((s, i) => s + (i.carbsG || 0), 0)) || 0;
  const fat = Math.round(todayItems.reduce((s, i) => s + (i.fatG || 0), 0)) || 0;
  
  const burned = Math.round(activity?.caloriesBurned || 0);
  const net = consumed - burned;
  const target = profile?.dailyCalorieTarget || 2000;
  const stepsGoal = 10000;
  const stepsPct = Math.min(((activity?.steps || 0) / stepsGoal) * 100, 100);

  const insights = generateInsights({ todayItems, profile: profile || {}, caloriesBurned: burned, recentLogs }) || [];

  // Generate morning brief slides from the full dataset
  const briefSlides = useMemo(
    () =>
      generateMorningBrief({
        profile: profile || {},
        todayItems,
        recentLogs,
        activity,
      }),
    // Recompute when food log, logs, or activity data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayItems.length, recentLogs.length, activity.steps, profile?.goal]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.dateText}>{formatToday()}</Text>
            <Text style={styles.greeting}>{greeting()}{profile?.displayName ? `, ${firstName(profile.displayName)}` : ""}</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{net <= 0 ? "On Track" : "Over Target"}</Text>
          </View>
        </View>

        {!pedometerAvailable && (
          <View style={styles.permissionBanner}>
            <Footprints size={14} color={theme.colors.accentWarn} />
            <Text style={styles.permissionText}>Enable Motion & Fitness in Settings to track steps and calories burned.</Text>
          </View>
        )}

        {/* Morning Brief Hero — replaces the old small AI Coach card */}
        <MorningBriefHero slides={briefSlides} />

        {/* Overflow insights (small pills below hero, if any remain after Morning Brief) */}
        {insights.length > 0 && (
          <View style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <Sparkles size={14} color="#C9E4B5" />
              <Text style={styles.coachLabel}>AI COACH</Text>
            </View>
            {insights.slice(0, 2).map((ins, index) => {
              const Icon = INSIGHT_ICONS[ins.kind] || Sparkles;
              return (
                <View key={ins.id || `insight-${index}`} style={styles.coachRow}>
                  <Icon size={14} color="#C9E4B5" style={{ marginTop: 2 }} />
                  <Text style={styles.coachText}>{ins.text}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Energy Balance Card */}
        <View style={styles.balanceCard}>
          <ProgressRing consumed={consumed} target={target} size={120} />
          <View style={styles.balanceRight}>
            <Text style={styles.balanceLabel}>Net Energy Balance</Text>
            <Text style={[styles.balanceValue, { color: net <= 0 ? theme.colors.primary : theme.colors.accentWarn }]}>
              {net > 0 ? "+" : ""}{net} kcal
            </Text>
            <View style={styles.balanceRow}>
              <View style={styles.balancePill}>
                <Flame size={11} color={theme.colors.primary} />
                <Text style={styles.balancePillText}>{burned} burned</Text>
              </View>
              <View style={[styles.balancePill, { backgroundColor: "#FDF0E8" }]}>
                <Apple size={11} color={theme.colors.accentWarn} />
                <Text style={[styles.balancePillText, { color: theme.colors.accentWarn }]}>{consumed} eaten</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Activity Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardWide]}>
            <View style={styles.statCardHeader}>
              <Footprints size={16} color={theme.colors.primary} />
              <Text style={styles.statCardTitle}>Steps</Text>
            </View>
            <Text style={styles.statCardValue}>{(activity?.steps || 0).toLocaleString()}</Text>
            <Text style={styles.statCardSub}>Goal: {stepsGoal.toLocaleString()}</Text>
            <View style={styles.statProgressTrack}>
              <View style={[styles.statProgressFill, { width: `${stepsPct}%`, backgroundColor: theme.colors.primary }]} />
            </View>
            <Text style={styles.statProgressPct}>{Math.round(stepsPct)}% of daily goal</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <MapPin size={16} color="#9C7A2F" />
              <Text style={styles.statCardTitle}>Distance</Text>
            </View>
            <Text style={[styles.statCardValue, { color: "#9C7A2F" }]}>{activity?.distanceKm || 0}</Text>
            <Text style={styles.statCardSub}>km today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <Flame size={16} color={theme.colors.accentWarn} />
              <Text style={styles.statCardTitle}>Energy Burn</Text>
            </View>
            <Text style={[styles.statCardValue, { color: theme.colors.accentWarn, fontSize: 20 }]}>
              {burned} <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Total</Text>
            </Text>
            <Text style={[styles.statCardValue, { color: theme.colors.primary, fontSize: 18, marginTop: 4 }]}>
              {activity?.activeCalories || 0} <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Active</Text>
            </Text>
            <Text style={styles.statCardSub}>kcal breakdown</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <Droplet size={16} color="#3A7FC1" />
              <Text style={styles.statCardTitle}>Water</Text>
            </View>
            <Text style={[styles.statCardValue, { color: "#3A7FC1" }]}>—</Text>
            <Text style={styles.statCardSub}>coming soon</Text>
          </View>
        </View>

        {/* Macros */}
        <Text style={styles.sectionTitle}>Macros Today</Text>
        <View style={styles.macroRow}>
          <MacroCard label="Protein" value={protein} goal={profile?.proteinTargetG || 90} color={theme.colors.primary} emoji="🥩" />
          <MacroCard label="Carbs" value={carbs} goal={profile?.carbsTargetG || 220} color={theme.colors.accentWarn} emoji="🍚" />
          <MacroCard label="Fat" value={fat} goal={profile?.fatTargetG || 60} color="#9C7A2F" emoji="🥑" />
        </View>

        {/* Meals */}
        <Text style={styles.sectionTitle}>Today's Meals</Text>
        {MEAL_TYPES.map((m) => {
          const items = todayItems.filter((i) => i.mealType === m);
          const mealKcal = items.reduce((s, i) => s + (i.kcal || 0), 0);
          return (
            <TouchableOpacity key={m} style={styles.mealCard} onPress={() => navigation.navigate("FoodLogger", { mealType: m })} activeOpacity={0.7}>
              <View style={styles.mealRow}>
                <View style={[styles.mealIcon, { backgroundColor: mealColors[m] + "20" }]}>
                  <Text style={{ fontSize: 16 }}>{mealEmojis[m]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mealName}>{MEAL_LABELS[m]}</Text>
                  <Text style={styles.mealSub}>{items.length === 0 ? "Tap to log" : `${items.length} item${items.length > 1 ? "s" : ""} · ${mealKcal} kcal`}</Text>
                </View>
                <View style={[styles.addButton, { backgroundColor: mealColors[m] }]}>
                  <Plus size={16} color="#fff" />
                </View>
              </View>
              {items.length > 0 && (
                <View style={styles.emojiRow}>
                  {items.map((it, idx) => (
                    // FIXED KEY PROP: Used a combination of index and id to keep rendering distinct
                    <Text key={it.id ? `${it.id}-${idx}` : `emoji-${idx}`} style={styles.emoji}>
                      {it.emoji}
                    </Text>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroCard({ label, value, goal, color, emoji }) {
  const pct = Math.min((value / goal) * 100, 100);
  const over = value > goal;
  return (
    <View style={styles.macroCard}>
      <Text style={styles.macroEmoji}>{emoji}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={[styles.macroValue, over && { color: theme.colors.accentWarn }]}>{Math.round(value)}g</Text>
      <Text style={styles.macroGoal}>of {goal}g</Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: over ? theme.colors.accentWarn : color }]} />
      </View>
    </View>
  );
}

const mealEmojis = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" };
const mealColors = { breakfast: "#E8854A", lunch: "#2F6B4F", dinner: "#3A7FC1", snack: "#9C7A2F" };

function formatToday() { return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); }
function greeting() { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 18) return "Good afternoon"; return "Good evening"; }
function firstName(name) { return name.split(" ")[0]; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: Platform.OS === "android" ? 90 : 30 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  dateText: { fontSize: 12, color: theme.colors.textMuted },
  greeting: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  headerBadge: { backgroundColor: theme.colors.primary + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: "700", color: theme.colors.primary },
  permissionBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 20, marginBottom: 8, padding: 12, backgroundColor: "#FFF4EC", borderRadius: 12, borderWidth: 1, borderColor: "#F0C9A4" },
  permissionText: { flex: 1, fontSize: 12, color: theme.colors.accentWarn, lineHeight: 17 },
  coachCard: { margin: 20, marginBottom: 10, backgroundColor: theme.colors.primaryDark, borderRadius: 18, padding: 16 },
  coachHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  coachLabel: { fontSize: 11, letterSpacing: 0.5, color: "#C9E4B5", fontWeight: "700" },
  coachRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  coachText: { flex: 1, fontSize: 13, lineHeight: 18, color: "#EFEAE0" },
  balanceCard: { marginHorizontal: 20, marginBottom: 14, backgroundColor: theme.colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: theme.colors.border, flexDirection: "row", alignItems: "center", gap: 16 },
  balanceRight: { flex: 1 },
  balanceLabel: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 },
  balanceValue: { fontSize: 26, fontWeight: "700", fontFamily: theme.fonts.display, marginBottom: 10 },
  balanceRow: { flexDirection: "row", gap: 6 },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4EE", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  balancePillText: { fontSize: 11, fontWeight: "600", color: theme.colors.primary },
  statsGrid: { paddingHorizontal: 20, gap: 10, flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  statCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border, width: "47%" },
  statCardWide: { width: "100%" },
  statCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  statCardTitle: { fontSize: 12, fontWeight: "600", color: theme.colors.textSubtle },
  statCardValue: { fontSize: 24, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  statCardSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  statProgressTrack: { height: 6, backgroundColor: theme.colors.border, borderRadius: 3, marginTop: 8 },
  statProgressFill: { height: "100%", borderRadius: 3 },
  statProgressPct: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  sectionTitle: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: theme.colors.text },
  macroRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20 },
  macroCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" },
  macroEmoji: { fontSize: 20, marginBottom: 4 },
  macroLabel: { fontSize: 11, fontWeight: "600", color: theme.colors.textSubtle },
  macroValue: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: 4, fontFamily: theme.fonts.display },
  macroGoal: { fontSize: 10, color: theme.colors.textMuted },
  macroTrack: { height: 5, width: "100%", backgroundColor: theme.colors.border, borderRadius: 3, marginTop: 6 },
  macroFill: { height: "100%", borderRadius: 3 },
  mealCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  mealRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  mealIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mealName: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  mealSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  addButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emojiRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  emoji: { fontSize: 18 },
});