import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import { getRecentLogs } from "../services/logService";
import { theme } from "../theme";
import TrendBarChart from "../components/TrendBarChart";

// Weekly + monthly trend graphs for calories consumed vs burned (FR-4.4, FR-4.5).
const RANGE_OPTIONS = [
  { id: "week", label: "Weekly", days: 7 },
  { id: "month", label: "Monthly", days: 30 },
];

// Guard: only sum items that are genuine food log objects (not stale number arrays
// left over from the food-log overwrite bug that has since been fixed).
function consumedFor(log) {
  return (log.items || []).reduce((s, i) => {
    if (typeof i !== "object" || i === null || typeof i.kcal !== "number") return s;
    return s + i.kcal;
  }, 0);
}

function formatShortDate(dateKey, granularity) {
  const d = new Date(dateKey + "T00:00:00");
  if (granularity === "week") {
    return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
  }
  return String(d.getDate());
}

// For the monthly view, bucket 30 daily points into ~10 groups of 3 days so the
// chart stays readable instead of cramming 30 thin bars into one screen.
function bucketLogs(logs, days) {
  if (days <= 7) {
    return logs.map((log) => ({
      label: formatShortDate(log.date, "week"),
      burned: log.caloriesBurned || 0,
      consumed: consumedFor(log),
    }));
  }
  const bucketSize = 3;
  const buckets = [];
  for (let i = 0; i < logs.length; i += bucketSize) {
    const slice = logs.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    const avgBurned = Math.round(slice.reduce((s, l) => s + (l.caloriesBurned || 0), 0) / slice.length);
    const avgConsumed = Math.round(slice.reduce((s, l) => s + consumedFor(l), 0) / slice.length);
    buckets.push({
      label: formatShortDate(slice[0].date, "month"),
      burned: avgBurned,
      consumed: avgConsumed,
    });
  }
  return buckets;
}

export default function TrendsScreen() {
  const { user } = useAuth();
  const [range, setRange] = useState("week");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const rangeConfig = RANGE_OPTIONS.find((r) => r.id === range);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getRecentLogs(user.uid, rangeConfig.days);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }, [user, range]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const chartData = useMemo(() => bucketLogs(logs, rangeConfig.days), [logs, range]);

  const stats = useMemo(() => {
    if (logs.length === 0) return null;
    const totalBurned = logs.reduce((s, l) => s + (l.caloriesBurned || 0), 0);
    const totalConsumed = logs.reduce((s, l) => s + consumedFor(l), 0);
    const totalSteps = logs.reduce((s, l) => s + (l.steps || 0), 0);
    const avgBurned = Math.round(totalBurned / logs.length);
    const avgConsumed = Math.round(totalConsumed / logs.length);
    const avgSteps = Math.round(totalSteps / logs.length);
    const avgNet = avgConsumed - avgBurned;
    return { avgBurned, avgConsumed, avgSteps, avgNet, daysLogged: logs.length };
  }, [logs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Trends</Text>
          <Text style={styles.subtitle}>Calories burned vs. consumed over time</Text>
        </View>

        <View style={styles.toggleRow}>
          {RANGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.toggleBtn, range === opt.id && styles.toggleBtnActive]}
              onPress={() => setRange(opt.id)}
            >
              <Text style={[styles.toggleText, range === opt.id && styles.toggleTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <>
            <View style={styles.chartCard}>
              <Text style={styles.chartCardTitle}>
                {range === "week" ? "Last 7 days" : "Last 30 days (3-day average)"}
              </Text>
              <TrendBarChart data={chartData} />
            </View>

            {stats && (
              <>
                <Text style={styles.sectionTitle}>
                  {range === "week" ? "Weekly" : "Monthly"} averages
                </Text>
                <View style={styles.statsGrid}>
                  <StatCard label="Avg. burned" value={`${stats.avgBurned}`} unit="kcal/day" />
                  <StatCard label="Avg. consumed" value={`${stats.avgConsumed}`} unit="kcal/day" />
                  <NetStatCard net={stats.avgNet} />
                  <StatCard label="Avg. steps" value={stats.avgSteps.toLocaleString()} unit="steps/day" />
                </View>
                <Text style={styles.footnote}>
                  Based on {stats.daysLogged} day{stats.daysLogged > 1 ? "s" : ""} of data.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  );
}

function NetStatCard({ net }) {
  const isDeficit = net < 0;
  const isBalanced = Math.abs(net) <= 100;
  const Icon = isBalanced ? Minus : isDeficit ? TrendingDown : TrendingUp;
  const color = isBalanced ? theme.colors.textMuted : isDeficit ? theme.colors.primary : theme.colors.accentWarn;
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>Avg. net balance</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon size={14} color={color} />
        <Text style={[styles.statValue, { color }]}>{net > 0 ? "+" : ""}{net}</Text>
      </View>
      <Text style={styles.statUnit}>kcal/day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  subtitle: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },

  toggleRow: { flexDirection: "row", marginHorizontal: 20, marginTop: 16, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: theme.colors.border },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  toggleBtnActive: { backgroundColor: theme.colors.primary },
  toggleText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  toggleTextActive: { color: "#fff" },

  loadingWrap: { paddingVertical: 60, alignItems: "center" },

  chartCard: { margin: 20, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
  chartCardTitle: { fontSize: 12.5, fontWeight: "600", color: theme.colors.textSubtle, marginBottom: 8 },

  sectionTitle: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: theme.colors.text },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 10 },
  statCard: { width: "47%", backgroundColor: theme.colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
  statLabel: { fontSize: 11, color: theme.colors.textMuted },
  statValue: { fontSize: 18, fontWeight: "700", color: theme.colors.text, marginTop: 4, fontFamily: theme.fonts.display },
  statUnit: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },

  footnote: { fontSize: 11, color: theme.colors.textMuted, textAlign: "center", marginTop: 14, paddingHorizontal: 20 },
});
