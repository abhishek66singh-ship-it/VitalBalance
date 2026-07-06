import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { theme } from "../theme";

export default function SettingsScreen() {
  const { user, profile, signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={{ padding: 20 }}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{user?.email || profile?.displayName || "Unknown"}</Text>
        </View>

        {profile?.dailyCalorieTarget && (
          <View style={styles.card}>
            <Text style={styles.label}>Daily Calorie Target</Text>
            <Text style={styles.value}>{profile.dailyCalorieTarget} kcal</Text>
            <Text style={styles.label2}>Protein {profile.proteinTargetG}g \u00b7 Carbs {profile.carbsTargetG}g \u00b7 Fat {profile.fatTargetG}g</Text>
          </View>
        )}

        <Button title="Sign Out" variant="outline" onPress={confirmSignOut} style={{ marginTop: 10 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display, marginBottom: 16 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 16, marginBottom: 12 },
  label: { fontSize: 11, color: theme.colors.textMuted },
  label2: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
  value: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: 4 },
});
