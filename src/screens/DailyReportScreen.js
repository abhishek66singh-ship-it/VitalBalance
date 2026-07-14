import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Flame, Footprints, MapPin, TrendingUp, TrendingDown, Sparkles, Apple, Zap, RefreshCw } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { getDayLog, todayKey } from "../services/logService";
import { getTodayActivity } from "../services/activityService";
import { theme } from "../theme";

function getDatesArray(count = 30) {
  const dates = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push({
      key: d.toISOString().split("T")[0],
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: d.getDate(),
      month: d.toLocaleDateString(undefined, { month: "short" }),
      isToday: i === 0,
    });
  }
  return dates;
}

function MacroRing({ value, goal, color, label, size = 70 }) {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: size, height: size }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 6, borderColor: theme.colors.border, position: "absolute" }} />
          <View style={{
            width: size, height: size, borderRadius: size / 2,
            borderWidth: 6, borderColor: color,
            borderTopColor: pct > 0.25 ? color : "transparent",
            borderRightColor: pct > 0.5 ? color : "transparent",
            borderBottomColor: pct > 0.75 ? color : "transparent",
            borderLeftColor: pct > 0 ? color : "transparent",
            position: "absolute",
            transform: [{ rotate: "-90deg" }],
          }} />
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.text }}>{Math.round(value)}g</Text>
          <Text style={{ fontSize: 9, color: theme.colors.textMuted }}>/{Math.round(goal)}g</Text>
        </View>
      </View>
      <Text style={{ fontSize: 11, fontWeight: "600", color }}>{label}</Text>
    </View>
  );
}

function ProgressBarRow({ label, value, goal, color, unit = "" }) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  const over = value > goal;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, over && { color: theme.colors.accentWarn }]}>
          {Math.round(value)}{unit} / {Math.round(goal)}{unit}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: over ? theme.colors.accentWarn : color }]} />
      </View>
    </View>
  );
}

function generateAIReport({ consumed, burned, protein, carbs, fat, steps, proteinGoal, carbsGoal, fatGoal, calorieTarget }) {
  const insights = [];
  const net = consumed - burned;
  const proteinPct = proteinGoal > 0 ? protein / proteinGoal : 0;
  const carbsPct = carbsGoal > 0 ? carbs / carbsGoal : 0;
  const fatPct = fatGoal > 0 ? fat / fatGoal : 0;

  if (consumed === 0) {
    return [{ icon: "💡", text: "No food logged for this day yet.", type: "neutral" }];
  }
  if (net < -600) insights.push({ icon: "⚠️", text: `Calorie deficit of ${Math.abs(net)} kcal is quite high. Aim for a moderate deficit of 300–500 kcal for sustainable weight loss.`, type: "warn" });
  else if (net > 500) insights.push({ icon: "📈", text: `Calorie surplus of ${net} kcal. If you're not in a muscle-building phase, consider reducing portion sizes slightly.`, type: "warn" });
  else if (net <= 0) insights.push({ icon: "✅", text: `Great job — you maintained a healthy calorie balance today with a deficit of ${Math.abs(net)} kcal.`, type: "positive" });
  else insights.push({ icon: "✅", text: `You stayed close to your maintenance calories today.`, type: "positive" });

  if (proteinPct < 0.7) insights.push({ icon: "🥩", text: `Protein intake is at ${Math.round(proteinPct * 100)}% of your goal. Try adding dal, paneer, curd, eggs, or chicken to meet your target.`, type: "tip" });
  else if (proteinPct >= 1) insights.push({ icon: "💪", text: `Protein goal met! At ${Math.round(protein)}g, you're supporting muscle repair and satiety well.`, type: "positive" });

  if (carbsPct > 1.2) insights.push({ icon: "🍚", text: `Carbohydrate intake is ${Math.round(carbsPct * 100)}% of your goal. Consider replacing some refined carbs with vegetables or protein.`, type: "warn" });

  if (fatPct > 1.3) insights.push({ icon: "🛢️", text: `Fat intake is higher than recommended. Try reducing fried foods or ghee to bring it closer to ${Math.round(fatGoal)}g.`, type: "warn" });

  if (steps < 5000) insights.push({ icon: "🚶", text: `Only ${steps.toLocaleString()} steps today. A short 20-minute walk can help burn an extra 80–100 kcal and improve metabolism.`, type: "tip" });
  else if (steps >= 10000) insights.push({ icon: "🏃", text: `Excellent — ${steps.toLocaleString()} steps today. You've hit the recommended daily step count.`, type: "positive" });

  return insights;
}

export default function DailyReportScreen() {
  const { user, profile } = useAuth();
  const dates = useMemo(() => getDatesArray(30), []);
  const todayDateKey = dates[dates.length - 1].key;
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const [log, setLog] = useState(null);
  const [liveActivity, setLiveActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getDayLog(user.uid, selectedDate);
      setLog(data);
      // For today: also fetch live activity data from the sensor
      // so Report matches the dashboard exactly (not stale Firestore data)
      if (selectedDate === todayDateKey) {
        const live = await getTodayActivity(profile?.weightKg, profile?.heightCm);
        if (live.available) setLiveActivity(live);
        else setLiveActivity(null);
      } else {
        setLiveActivity(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, profile?.weightKg, profile?.heightCm]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const items = log?.items || [];
  const consumed = items.reduce((s, i) => s + i.kcal, 0);
  const protein = items.reduce((s, i) => s + (i.proteinG || 0), 0);
  const carbs = items.reduce((s, i) => s + (i.carbsG || 0), 0);
  const fat = items.reduce((s, i) => s + (i.fatG || 0), 0);

  // For today: use live sensor data (matches dashboard exactly)
  // For past dates: use Firestore data (what was recorded that day)
  const burned = liveActivity?.caloriesBurned ?? log?.caloriesBurned ?? 0;
  const steps = liveActivity?.steps ?? log?.steps ?? 0;
  const distanceKm = liveActivity?.distanceKm ?? log?.distanceKm ?? 0;
  const net = consumed - burned;

  const proteinGoal = profile?.proteinTargetG || 90;
  const carbsGoal = profile?.carbsTargetG || 220;
  const fatGoal = profile?.fatTargetG || 60;
  const calorieTarget = profile?.dailyCalorieTarget || 2000;

  const aiInsights = useMemo(() => generateAIReport({ consumed, burned, protein, carbs, fat, steps, proteinGoal, carbsGoal, fatGoal, calorieTarget }), [log]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Daily Report</Text>
          <Text style={styles.subtitle}>Select a date to see your summary</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} hitSlop={10}>
          <RefreshCw size={18} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Horizontal date scroller */}
      <FlatList
        data={dates}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        initialScrollIndex={dates.length - 1}
        getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingVertical: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.dateChip, selectedDate === item.key && styles.dateChipActive, item.isToday && styles.dateChipToday]}
            onPress={() => setSelectedDate(item.key)}
          >
            <Text style={[styles.dateDay, selectedDate === item.key && styles.dateDayActive]}>{item.day}</Text>
            <Text style={[styles.dateNum, selectedDate === item.key && styles.dateNumActive]}>{item.date}</Text>
            {item.isToday && <View style={styles.todayDot} />}
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: Platform.OS === "android" ? 90 : 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >

          {/* Energy balance hero card */}
          <View style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroItem}>
                <Flame size={18} color={theme.colors.primary} />
                <Text style={styles.heroValue}>{burned}</Text>
                <Text style={styles.heroLabel}>Burned</Text>
              </View>
              <View style={styles.heroSeparator}>
                <Text style={styles.heroMinus}>−</Text>
              </View>
              <View style={styles.heroItem}>
                <Apple size={18} color={theme.colors.accentWarn} />
                <Text style={styles.heroValue}>{consumed}</Text>
                <Text style={styles.heroLabel}>Consumed</Text>
              </View>
              <View style={styles.heroSeparator}>
                <Text style={styles.heroMinus}>=</Text>
              </View>
              <View style={styles.heroItem}>
                {net <= 0 ? <TrendingDown size={18} color={theme.colors.primary} /> : <TrendingUp size={18} color={theme.colors.accentWarn} />}
                <Text style={[styles.heroValue, { color: net <= 0 ? theme.colors.primary : theme.colors.accentWarn }]}>
                  {net > 0 ? "+" : ""}{net}
                </Text>
                <Text style={styles.heroLabel}>Net kcal</Text>
              </View>
            </View>
            <View style={styles.heroProgressTrack}>
              <View style={[styles.heroProgressFill, {
                width: `${Math.min((consumed / (calorieTarget || 2000)) * 100, 100)}%`,
                backgroundColor: consumed > calorieTarget ? theme.colors.accentWarn : theme.colors.primary
              }]} />
            </View>
            <Text style={styles.heroProgressLabel}>{consumed} / {calorieTarget} kcal daily target</Text>
          </View>

          {/* Activity stats */}
          <Text style={styles.sectionTitle}>Activity</Text>
          <View style={styles.activityRow}>
            <View style={styles.activityCard}>
              <Footprints size={20} color={theme.colors.primary} />
              <Text style={styles.activityValue}>{steps.toLocaleString()}</Text>
              <Text style={styles.activityLabel}>Steps</Text>
            </View>
            <View style={styles.activityCard}>
              <MapPin size={20} color={theme.colors.accentTip} />
              <Text style={styles.activityValue}>{distanceKm} km</Text>
              <Text style={styles.activityLabel}>Distance</Text>
            </View>
            <View style={styles.activityCard}>
              <Zap size={20} color={theme.colors.accentWarn} />
              <Text style={styles.activityValue}>{burned}</Text>
              <Text style={styles.activityLabel}>kcal Burned</Text>
            </View>
          </View>

          {/* Macros */}
          <Text style={styles.sectionTitle}>Macronutrients</Text>
          <View style={styles.macroRingRow}>
            <MacroRing value={protein} goal={proteinGoal} color={theme.colors.primary} label="Protein" />
            <MacroRing value={carbs} goal={carbsGoal} color={theme.colors.accentWarn} label="Carbs" />
            <MacroRing value={fat} goal={fatGoal} color={theme.colors.accentTip} label="Fat" />
          </View>

          <View style={styles.macroBarCard}>
            <ProgressBarRow label="Protein" value={protein} goal={proteinGoal} color={theme.colors.primary} unit="g" />
            <ProgressBarRow label="Carbohydrates" value={carbs} goal={carbsGoal} color={theme.colors.accentWarn} unit="g" />
            <ProgressBarRow label="Fat" value={fat} goal={fatGoal} color={theme.colors.accentTip} unit="g" />
            <ProgressBarRow label="Calories" value={consumed} goal={calorieTarget} color={theme.colors.primary} unit=" kcal" />
          </View>

          {/* Food logged */}
          {items.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Food Logged</Text>
              <View style={styles.foodLogCard}>
                {items.map((item, i) => (
                  <View key={item.id} style={[styles.foodLogRow, i < items.length - 1 && styles.foodLogDivider]}>
                    <Text style={styles.foodEmoji}>{item.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodName}>{item.name}{item.variant ? ` (${item.variant})` : ""}</Text>
                      <Text style={styles.foodSub}>{item.portionLabel} · {item.mealType}</Text>
                    </View>
                    <Text style={styles.foodKcal}>{item.kcal} kcal</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* AI Recommendations */}
          <Text style={styles.sectionTitle}>AI Recommendations</Text>
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Sparkles size={14} color="#C9E4B5" />
              <Text style={styles.aiHeaderText}>Personalized Analysis</Text>
            </View>
            {aiInsights.map((insight, i) => (
              <View key={i} style={[styles.aiRow, i < aiInsights.length - 1 && styles.aiRowDivider]}>
                <Text style={styles.aiIcon}>{insight.icon}</Text>
                <Text style={styles.aiText}>{insight.text}</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  subtitle: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },
  refreshBtn: { padding: 8, marginTop: 4 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  dateChip: { width: 52, alignItems: "center", paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  dateChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  dateChipToday: { borderColor: theme.colors.primary },
  dateDay: { fontSize: 10, color: theme.colors.textMuted, fontWeight: "600" },
  dateDayActive: { color: "#fff" },
  dateNum: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: 2 },
  dateNumActive: { color: "#fff" },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary, marginTop: 3 },

  heroCard: { margin: 20, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: theme.colors.border },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  heroItem: { flex: 1, alignItems: "center", gap: 4 },
  heroValue: { fontSize: 20, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  heroLabel: { fontSize: 10.5, color: theme.colors.textMuted },
  heroSeparator: { paddingHorizontal: 6 },
  heroMinus: { fontSize: 20, color: theme.colors.textMuted, fontWeight: "300" },
  heroProgressTrack: { height: 8, backgroundColor: theme.colors.border, borderRadius: 4 },
  heroProgressFill: { height: "100%", borderRadius: 4 },
  heroProgressLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, textAlign: "center" },

  sectionTitle: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: theme.colors.text },

  activityRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20 },
  activityCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", gap: 6 },
  activityValue: { fontSize: 17, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  activityLabel: { fontSize: 10.5, color: theme.colors.textMuted },

  macroRingRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 20, marginBottom: 12 },

  macroBarCard: { marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border, gap: 12 },
  progressRow: { gap: 6 },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 12, fontWeight: "600", color: theme.colors.textSubtle },
  progressValue: { fontSize: 12, color: theme.colors.textMuted },
  progressTrack: { height: 7, backgroundColor: theme.colors.border, borderRadius: 4 },
  progressFill: { height: "100%", borderRadius: 4 },

  foodLogCard: { marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" },
  foodLogRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  foodLogDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  foodEmoji: { fontSize: 20 },
  foodName: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  foodSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1, textTransform: "capitalize" },
  foodKcal: { fontSize: 13, fontWeight: "700", color: theme.colors.primary },

  aiCard: { marginHorizontal: 20, backgroundColor: theme.colors.primaryDark, borderRadius: 18, padding: 16, marginBottom: 8 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  aiHeaderText: { fontSize: 11, letterSpacing: 0.5, color: "#C9E4B5", fontWeight: "700" },
  aiRow: { flexDirection: "row", gap: 10, paddingVertical: 8 },
  aiRowDivider: { borderBottomWidth: 1, borderBottomColor: "#ffffff15" },
  aiIcon: { fontSize: 16 },
  aiText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#EFEAE0" },
});
