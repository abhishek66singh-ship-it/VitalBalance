import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";
import { Activity, Smartphone, Apple, Heart, ChevronRight, Check, AlertCircle, LogOut, User, Target } from "lucide-react-native";

const HEALTH_SOURCES = [
  {
    id: "device_pedometer",
    name: "Device Pedometer",
    description: "Steps, distance and calories from your phone built-in sensor",
    platform: "both",
    status: "connected",
    icon: Smartphone,
    color: theme.colors.primary,
    free: true,
    note: "Currently active — this is your default data source",
  },
  {
    id: "health_connect",
    name: "Google Health Connect",
    description: "Sync steps, calories, distance and workouts from Samsung Health, Fitbit, Garmin and more via Health Connect",
    platform: "android",
    status: "available",
    icon: Activity,
    color: "#4285F4",
    free: true,
    note: "Free — requires one rebuild of the app with Health Connect enabled",
  },
  {
    id: "apple_health",
    name: "Apple Health",
    description: "Sync steps, calories, distance and workouts from Apple Health and connected apps",
    platform: "ios",
    status: "requires_account",
    icon: Apple,
    color: "#000000",
    free: false,
    note: "Requires Apple Developer account ($99/year) to build and distribute",
  },
];

export default function SettingsScreen() {
  const { user, profile, signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }

  function handleHealthSourceTap(source) {
    if (source.status === "connected") {
      Alert.alert(source.name, "This data source is currently active and syncing your activity data automatically.", [{ text: "OK" }]);
      return;
    }
    if (source.id === "health_connect") {
      Alert.alert(
        "Enable Google Health Connect",
        "Health Connect is completely free and pulls data from Google Fit, Samsung Health, Fitbit, Garmin and more — all in one place.\n\nEnabling it requires rebuilding the app once with the Health Connect library. Would you like this in the next update?",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Yes, Enable It", onPress: () => Alert.alert("Noted!", "Google Health Connect will be included in the next app build.") },
        ]
      );
    }
    if (source.id === "apple_health") {
      Alert.alert(
        "Apple Health",
        "Apple Health integration is free to use but requires an Apple Developer account ($99/year) to build and distribute the iOS app.\n\nOnce that is set up, HealthKit sync can be added at no extra cost.",
        [{ text: "OK" }]
      );
    }
  }

  const currentPlatform = Platform.OS;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: Platform.OS === "android" ? 90 : 40 }}>
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + "18" }]}>
              <User size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Signed in as</Text>
              <Text style={styles.cardValue}>{profile?.displayName || user?.email || "—"}</Text>
              {profile?.displayName && <Text style={styles.cardSub}>{user?.email}</Text>}
            </View>
          </View>
        </View>

        {profile?.dailyCalorieTarget && (
          <>
            <Text style={styles.sectionTitle}>Your Goals</Text>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.accentWarn + "18" }]}>
                  <Target size={18} color={theme.colors.accentWarn} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>Daily Calorie Target</Text>
                  <Text style={styles.cardValue}>{profile.dailyCalorieTarget} kcal</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.macroRow}>
                <MacroItem label="Protein" value={profile.proteinTargetG} unit="g" color={theme.colors.primary} />
                <MacroItem label="Carbs" value={profile.carbsTargetG} unit="g" color={theme.colors.accentWarn} />
                <MacroItem label="Fat" value={profile.fatTargetG} unit="g" color="#9C7A2F" />
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Activity Data Sources</Text>
        <Text style={styles.sectionSubtitle}>
          Manage where VitalBalance reads your steps, distance and calories burned.
        </Text>

        {HEALTH_SOURCES.map((source) => {
          if (source.platform !== "both" && source.platform !== currentPlatform) return null;
          const Icon = source.icon;
          const isConnected = source.status === "connected";
          const requiresAccount = source.status === "requires_account";
          return (
            <TouchableOpacity
              key={source.id}
              style={[styles.sourceCard, isConnected && styles.sourceCardActive]}
              onPress={() => handleHealthSourceTap(source)}
              activeOpacity={0.7}
            >
              <View style={styles.sourceHeader}>
                <View style={[styles.sourceIconWrap, { backgroundColor: source.color + "18" }]}>
                  <Icon size={20} color={source.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.sourceTitleRow}>
                    <Text style={styles.sourceName}>{source.name}</Text>
                    {isConnected && (
                      <View style={styles.connectedBadge}>
                        <Check size={10} color="#fff" />
                        <Text style={styles.connectedText}>Active</Text>
                      </View>
                    )}
                    {source.free && !isConnected && (
                      <View style={styles.freeBadge}>
                        <Text style={styles.freeText}>FREE</Text>
                      </View>
                    )}
                    {requiresAccount && (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidText}>$99/yr</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sourceDesc}>{source.description}</Text>
                </View>
                {!isConnected && <ChevronRight size={16} color={theme.colors.textMuted} />}
              </View>
              <View style={styles.sourceNote}>
                <AlertCircle size={12} color={isConnected ? theme.colors.primary : theme.colors.textMuted} />
                <Text style={[styles.sourceNoteText, isConnected && { color: theme.colors.primary }]}>{source.note}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.infoCard}>
          <Heart size={14} color={theme.colors.primary} />
          <Text style={styles.infoText}>
            All health APIs are completely free to use with no usage fees or quotas.
            The only cost for Apple Health is the Apple Developer account needed to distribute an iOS app.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Account Actions</Text>
        <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut} activeOpacity={0.7}>
          <LogOut size={18} color={theme.colors.accentWarn} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroItem({ label, value, unit, color }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[styles.macroValue, { color }]}>{value}{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display, paddingHorizontal: 20, paddingTop: 12, marginBottom: 4 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  sectionSubtitle: { fontSize: 12, color: theme.colors.textMuted, paddingHorizontal: 20, marginTop: -4, marginBottom: 10, lineHeight: 17 },
  card: { marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14, marginBottom: 8 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: 11, color: theme.colors.textMuted },
  cardValue: { fontSize: 15, fontWeight: "700", color: theme.colors.text, marginTop: 1 },
  cardSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 12 },
  macroRow: { flexDirection: "row" },
  macroValue: { fontSize: 16, fontWeight: "700", fontFamily: theme.fonts.display },
  macroLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  sourceCard: { marginHorizontal: 20, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14, marginBottom: 10 },
  sourceCardActive: { borderColor: theme.colors.primary + "40", backgroundColor: theme.colors.primary + "05" },
  sourceHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sourceIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 2 },
  sourceTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  sourceName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  connectedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.colors.primary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  connectedText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  freeBadge: { backgroundColor: "#E8F5E9", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  freeText: { fontSize: 10, color: theme.colors.primary, fontWeight: "700" },
  paidBadge: { backgroundColor: "#FFF4EC", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  paidText: { fontSize: 10, color: theme.colors.accentWarn, fontWeight: "700" },
  sourceDesc: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  sourceNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  sourceNoteText: { flex: 1, fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  infoCard: { marginHorizontal: 20, marginTop: 4, flexDirection: "row", gap: 8, backgroundColor: theme.colors.primary + "08", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.primary + "20" },
  infoText: { flex: 1, fontSize: 12, color: theme.colors.textSubtle, lineHeight: 17 },
  signOutBtn: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  signOutText: { fontSize: 15, fontWeight: "700", color: theme.colors.accentWarn },
});
