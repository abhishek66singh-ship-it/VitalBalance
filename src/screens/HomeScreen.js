import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Flame, Footprints, Droplet, Plus, Sparkles, Coffee, TrendingUp } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { getDayLog, todayKey, getRecentLogs, setDayActivity } from "../services/logService";
import { getTodayActivity, subscribeToStepUpdates, estimateCaloriesFromSteps, isPedometerAvailable } from "../services/activityService";
import { generateInsights } from "../services/aiCoach";
import { MEAL_TYPES, MEAL_LABELS } from "../data/foodLibrary";
import { theme } from "../theme";
import ProgressRing from "../components/ProgressRing";

const INSIGHT_ICONS = {
  pattern: Coffee,
  nudge: Coffee,
  deviation: TrendingUp,
  macro_gap: Sparkles,
  positive: Flame,
  safety_fallback: Sparkles,
  activity_nudge: Footprints,
};

export default function HomeScreen({ navigation }) {
  const { user, profile } = useAuth();
  const [todayItems, setTodayItems] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [activity, setActivity] = useState({ caloriesBurned: 0, steps: 0 });
  const [pedometerAvailable, setPedometerAvailable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const baseStepsRef = useRef(0); // steps read at load time, before live subscription deltas

  const load = useCallback(async () => {
    if (!user) return;
    const key = todayKey();
    const weightKg = profile?.weightKg;

    // Real step count from the phone's built-in pedometer sensor (same source
    // Step Set Go and similar apps use). Calories are estimated from those real
    // steps using the verified industry formula — see activityService.js.
    const liveActivity = await getTodayActivity(weightKg);
    setPedometerAvailable(liveActivity.available);
    baseStepsRef.current = liveActivity.steps;

    // Always overwrite Firestore with the fresh sensor reading so stale mock
    // data from previous builds never persists in Trends history.
    await setDayActivity(user.uid, key, {
      steps: liveActivity.available ? liveActivity.steps : 0,
      caloriesBurned: liveActivity.available ? liveActivity.caloriesBurned : 0,
    });

    const [day, recent] = await Promise.all([
      getDayLog(user.uid, key),
      getRecentLogs(user.uid, 7),
    ]);
    setTodayItems(day.items || []);
    setRecentLogs(recent);
    // Always use the live sensor reading for today's display — never the
    // Firestore cached value, which may contain stale mock data from a previous
    // build. Firestore is written to (setDayActivity above) so Trends has
    // history, but the dashboard always shows what the sensor says right now.
    setActivity({
      caloriesBurned: liveActivity.available ? liveActivity.caloriesBurned : (day.caloriesBurned ?? 0),
      steps: liveActivity.available ? liveActivity.steps : (day.steps ?? 0),
    });
  }, [user, profile?.weightKg]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live step updates while the Home screen is open, so the count ticks up in
  // real time as the user walks — exactly like a dedicated pedometer app.
  useEffect(() => {
    let subscription;
    (async () => {
      const available = await isPedometerAvailable();
      if (!available) return;
      subscription = subscribeToStepUpdates((deltaSteps) => {
        const totalSteps = baseStepsRef.current + deltaSteps;
        const weightKg = profile?.weightKg;
        const caloriesBurned = estimateCaloriesFromSteps(totalSteps, weightKg);
        setActivity({ steps: totalSteps, caloriesBurned });
        if (user) {
          setDayActivity(user.uid, todayKey(), { steps: totalSteps, caloriesBurned }).catch(() => {});
        }
      });
    })();
    return () => subscription?.remove();
  }, [user, profile?.weightKg]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const consumed = todayItems.reduce((s, i) => s + i.kcal, 0);
  const protein = todayItems.reduce((s, i) => s + (i.proteinG || 0), 0);
  const carbs = todayItems.reduce((s, i) => s + (i.carbsG || 0), 0);
  const fat = todayItems.reduce((s, i) => s + (i.fatG || 0), 0);
  const burned = activity.caloriesBurned;
  const net = consumed - burned;
  const target = profile?.dailyCalorieTarget || 2000;

  const insights = generateInsights({
    todayItems,
    profile: profile || {},
    caloriesBurned: burned,
    recentLogs,
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.dateText}>{formatToday()}</Text>
          <Text style={styles.greeting}>{greeting()}{profile?.displayName ? `, ${firstName(profile.displayName)}` : ""}</Text>
        </View>

        {!pedometerAvailable && (
          <View style={styles.permissionBanner}>
            <Footprints size={14} color={theme.colors.accentWarn} />
            <Text style={styles.permissionText}>
              Step tracking unavailable — enable Motion & Fitness in Settings to auto-track your steps and calories burned.
            </Text>
          </View>
        )}

        {insights.length > 0 && (
          <View style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <Sparkles size={14} color="#C9E4B5" />
              <Text style={styles.coachLabel}>AI COACH</Text>
            </View>
            {insights.slice(0, 2).map((ins) => {
              const Icon = INSIGHT_ICONS[ins.kind] || Sparkles;
              return (
                <View key={ins.id} style={styles.coachRow}>
                  <Icon size={14} color="#C9E4B5" style={{ marginTop: 2 }} />
                  <Text style={styles.coachText}>{ins.text}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.balanceCard}>
          <ProgressRing consumed={consumed} target={target} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.balanceLabel}>Net Energy Balance</Text>
            <Text style={[styles.balanceValue, { color: net <= 0 ? theme.colors.primary : theme.colors.accentWarn }]}>
              {net > 0 ? "+" : ""}{net} kcal
            </Text>
            <Text style={styles.balanceSub}>Burned {burned} \u2212 Consumed {consumed}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatPill icon={Flame} label="Burned" value={burned} />
          <StatPill icon={Footprints} label="Steps" value={activity.steps.toLocaleString()} />
          <StatPill icon={Droplet} label="Water" value="1.2L" />
        </View>

        <Text style={styles.sectionTitle}>Macros</Text>
        <View style={styles.statsRow}>
          <MacroBar label="Protein" value={protein} goal={profile?.proteinTargetG || 90} color={theme.colors.primary} />
          <MacroBar label="Carbs" value={carbs} goal={profile?.carbsTargetG || 220} color={theme.colors.accentWarn} />
          <MacroBar label="Fat" value={fat} goal={profile?.fatTargetG || 60} color={theme.colors.accentTip} />
        </View>

        <Text style={styles.sectionTitle}>Today's Meals</Text>
        {MEAL_TYPES.map((m) => {
          const items = todayItems.filter((i) => i.mealType === m);
          const mealKcal = items.reduce((s, i) => s + i.kcal, 0);
          return (
            <TouchableOpacity
              key={m}
              style={styles.mealCard}
              onPress={() => navigation.navigate("FoodLogger", { mealType: m })}
              activeOpacity={0.7}
            >
              <View style={styles.mealRow}>
                <View>
                  <Text style={styles.mealName}>{MEAL_LABELS[m]}</Text>
                  <Text style={styles.mealSub}>
                    {items.length === 0 ? "Not logged yet" : `${items.length} item${items.length > 1 ? "s" : ""} \u00b7 ${mealKcal} kcal`}
                  </Text>
                </View>
                <View style={styles.addButton}>
                  <Plus size={16} color="#fff" />
                </View>
              </View>
              {items.length > 0 && (
                <View style={styles.emojiRow}>
                  {items.map((it) => (
                    <Text key={it.id} style={styles.emoji}>{it.emoji}</Text>
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

function StatPill({ icon: Icon, label, value }) {
  return (
    <View style={styles.statPill}>
      <Icon size={16} color={theme.colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MacroBar({ label, value, goal, color }) {
  const pct = Math.min((value / goal) * 100, 100);
  return (
    <View style={styles.macroCard}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{Math.round(value)}g</Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function formatToday() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
function firstName(name) {
  return name.split(" ")[0];
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  dateText: { fontSize: 13, color: theme.colors.textMuted },
  greeting: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  permissionBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 20, marginTop: 10, padding: 12,
    backgroundColor: "#FFF4EC", borderRadius: 12,
    borderWidth: 1, borderColor: "#F0C9A4",
  },
  permissionText: { flex: 1, fontSize: 12, color: theme.colors.accentWarn, lineHeight: 17 },
  coachCard: { margin: 20, marginBottom: 6, backgroundColor: theme.colors.primaryDark, borderRadius: 18, padding: 16 },
  coachHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  coachLabel: { fontSize: 11, letterSpacing: 0.5, color: "#C9E4B5", fontWeight: "700" },
  coachRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  coachText: { flex: 1, fontSize: 13, lineHeight: 18, color: "#EFEAE0" },
  balanceCard: {
    margin: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  balanceLabel: { fontSize: 11, color: theme.colors.textMuted },
  balanceValue: { fontSize: 22, fontWeight: "700", fontFamily: theme.fonts.display },
  balanceSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20 },
  statPill: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statValue: { fontSize: 17, fontWeight: "700", color: theme.colors.text, marginTop: 6, fontFamily: theme.fonts.display },
  statLabel: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },
  sectionTitle: { marginHorizontal: 20, marginTop: 18, marginBottom: 8, fontSize: 13, fontWeight: "700", color: theme.colors.text },
  macroCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: theme.colors.border },
  macroLabel: { fontSize: 12, fontWeight: "600", color: theme.colors.textSubtle },
  macroValue: { fontSize: 15, fontWeight: "700", color: theme.colors.text, marginVertical: 4 },
  macroTrack: { height: 5, backgroundColor: theme.colors.border, borderRadius: 3 },
  macroFill: { height: "100%", borderRadius: 3 },
  mealCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  mealRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mealName: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  mealSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  emojiRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  emoji: { fontSize: 18 },
});
