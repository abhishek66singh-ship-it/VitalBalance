import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";
import { Activity, Smartphone, Apple, Heart, Check, AlertCircle, LogOut, User, Target, RefreshCw, Link } from "lucide-react-native";
import { isHealthSyncAvailable, buildGoogleFitnessAuthUrl, getAccessToken, saveAccessToken, clearAccessToken, parseTokenFromUrl, fetchGoogleFitnessToday } from "../services/googleHealthService";
import { setDayActivity, todayKey } from "../services/logService";

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const isWeb = Platform.OS === "web";

export default function SettingsScreen() {
  const { user, profile, signOut } = useAuth();
  const [fitnessToken, setFitnessToken] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const userEmail = user?.email || "";
  const canUseHealthSync = isHealthSyncAvailable(userEmail);

  useEffect(() => {
    if (!isWeb) return;
    const token = parseTokenFromUrl();
    if (token) {
      saveAccessToken(token);
      setFitnessToken(token);
      handleSyncWithToken(token);
    } else {
      const existing = getAccessToken();
      if (existing) setFitnessToken(existing);
    }
  }, []);

  async function handleSyncWithToken(token) {
    if (!token || !user) return;
    setSyncing(true);
    try {
      const data = await fetchGoogleFitnessToday(token, profile?.weightKg, profile?.heightCm);
      await setDayActivity(user.uid, todayKey(), { steps: data.steps, caloriesBurned: data.caloriesBurned, distanceKm: data.distanceKm });
      setLastSynced(new Date().toLocaleTimeString());
      Alert.alert("Synced!", `Steps: ${data.steps.toLocaleString()}\nCalories burned: ${data.caloriesBurned} kcal\nDistance: ${data.distanceKm} km\n\nGo back to Today tab to see updated data.`);
    } catch (e) {
      clearAccessToken();
      setFitnessToken(null);
      Alert.alert("Sync failed", e.message || "Could not fetch fitness data. Please reconnect.");
    } finally {
      setSyncing(false);
    }
  }

  function connectGoogleHealth() {
    if (!isWeb) {
      Alert.alert("Web Only", "Google Health sync is available on the web link only. Open the app in your browser to use this feature.");
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const url = buildGoogleFitnessAuthUrl(WEB_CLIENT_ID, redirectUri);
    window.location.href = url;
  }

  function disconnectGoogleHealth() {
    clearAccessToken();
    setFitnessToken(null);
    setLastSynced(null);
    Alert.alert("Disconnected", "Google Health sync has been disconnected.");
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }

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
              <Text style={styles.cardValue}>{profile?.displayName || userEmail || "—"}</Text>
              {profile?.displayName && <Text style={styles.cardSub}>{userEmail}</Text>}
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

        {!isWeb && (
          <View style={[styles.sourceCard, styles.sourceCardActive]}>
            <View style={styles.sourceHeader}>
              <View style={[styles.sourceIconWrap, { backgroundColor: theme.colors.primary + "18" }]}>
                <Smartphone size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.sourceTitleRow}>
                  <Text style={styles.sourceName}>Device Pedometer</Text>
                  <View style={styles.connectedBadge}><Check size={10} color="#fff" /><Text style={styles.connectedText}>Active</Text></View>
                </View>
                <Text style={styles.sourceDesc}>Steps, distance and calories from your phone's built-in sensor</Text>
              </View>
            </View>
            <View style={styles.sourceNote}>
              <AlertCircle size={12} color={theme.colors.primary} />
              <Text style={[styles.sourceNoteText, { color: theme.colors.primary }]}>Currently active — updates automatically as you walk</Text>
            </View>
          </View>
        )}

        {isWeb && (
          <View style={[styles.sourceCard, fitnessToken && styles.sourceCardActive]}>
            <View style={styles.sourceHeader}>
              <View style={[styles.sourceIconWrap, { backgroundColor: "#4285F418" }]}>
                <Activity size={20} color="#4285F4" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.sourceTitleRow}>
                  <Text style={styles.sourceName}>Google Health Sync</Text>
                  {fitnessToken ? (
                    <View style={styles.connectedBadge}><Check size={10} color="#fff" /><Text style={styles.connectedText}>Connected</Text></View>
                  ) : canUseHealthSync ? (
                    <View style={styles.betaBadge}><Text style={styles.betaText}>BETA</Text></View>
                  ) : (
                    <View style={styles.soonBadge}><Text style={styles.soonText}>COMING SOON</Text></View>
                  )}
                </View>
                <Text style={styles.sourceDesc}>Sync steps, calories and distance from Google Fit, Samsung Health, Fitbit and more</Text>
              </View>
            </View>
            {lastSynced && <Text style={styles.lastSynced}>Last synced: {lastSynced}</Text>}
            {canUseHealthSync ? (
              <View style={styles.syncBtnRow}>
                {fitnessToken ? (
                  <>
                    <TouchableOpacity style={styles.syncBtn} onPress={() => handleSyncWithToken(fitnessToken)} disabled={syncing}>
                      <RefreshCw size={14} color="#fff" />
                      <Text style={styles.syncBtnText}>{syncing ? "Syncing..." : "Sync Now"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectGoogleHealth}>
                      <Text style={styles.disconnectBtnText}>Disconnect</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.connectBtn} onPress={connectGoogleHealth}>
                    <Link size={14} color="#fff" />
                    <Text style={styles.syncBtnText}>Connect Google Health</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.sourceNote}>
                <AlertCircle size={12} color={theme.colors.textMuted} />
                <Text style={styles.sourceNoteText}>Coming soon — applying for Google production access to enable this for all users</Text>
              </View>
            )}
          </View>
        )}

        {Platform.OS === "ios" && (
          <View style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <View style={[styles.sourceIconWrap, { backgroundColor: "#00000018" }]}>
                <Apple size={20} color="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.sourceTitleRow}>
                  <Text style={styles.sourceName}>Apple Health</Text>
                  <View style={styles.soonBadge}><Text style={styles.soonText}>COMING SOON</Text></View>
                </View>
                <Text style={styles.sourceDesc}>Sync from Apple Health, Garmin, Withings and more</Text>
              </View>
            </View>
            <View style={styles.sourceNote}>
              <AlertCircle size={12} color={theme.colors.textMuted} />
              <Text style={styles.sourceNoteText}>Requires Apple Developer account ($99/year) — coming in a future update</Text>
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <Heart size={14} color={theme.colors.primary} />
          <Text style={styles.infoText}>
            {isWeb
              ? "Google Health sync uses secure OAuth2. Your fitness data is fetched directly from Google and saved only to your own account — never shared."
              : "On the Android app, steps and calories are read from your phone's motion sensor in real time — no account connection needed."}
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
  betaBadge: { backgroundColor: "#E8F5E9", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  betaText: { fontSize: 10, color: theme.colors.primary, fontWeight: "700" },
  soonBadge: { backgroundColor: "#F5F5F5", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  soonText: { fontSize: 10, color: theme.colors.textMuted, fontWeight: "700" },
  sourceDesc: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  sourceNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  sourceNoteText: { flex: 1, fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  lastSynced: { fontSize: 11, color: theme.colors.primary, marginTop: 6, marginBottom: 2 },
  syncBtnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  connectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#4285F4", borderRadius: 10, paddingVertical: 10 },
  syncBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 10 },
  syncBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  disconnectBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  disconnectBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  infoCard: { marginHorizontal: 20, marginTop: 4, flexDirection: "row", gap: 8, backgroundColor: theme.colors.primary + "08", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.primary + "20" },
  infoText: { flex: 1, fontSize: 12, color: theme.colors.textSubtle, lineHeight: 17 },
  signOutBtn: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  signOutText: { fontSize: 15, fontWeight: "700", color: theme.colors.accentWarn },
});
