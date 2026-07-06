import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import { theme } from "../theme";

const GOALS = [
  { id: "lose", label: "Lose Weight", desc: "Sustainable calorie deficit" },
  { id: "maintain", label: "Maintain", desc: "Stay at current weight" },
  { id: "gain", label: "Build Muscle", desc: "Calorie surplus + protein focus" },
];

const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", desc: "Little to no exercise", factor: 1.2 },
  { id: "light", label: "Lightly Active", desc: "1-3 days/week", factor: 1.375 },
  { id: "moderate", label: "Moderately Active", desc: "3-5 days/week", factor: 1.55 },
  { id: "active", label: "Very Active", desc: "6-7 days/week", factor: 1.725 },
];

// Mifflin-St Jeor equation, as specified in PRD 6.1.
function calcTDEE({ weightKg, heightCm, age, sex, activityFactor }) {
  const base =
    sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  return Math.round(base * activityFactor);
}

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(null);
  const [activityLevel, setActivityLevel] = useState(null);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("female");
  const [saving, setSaving] = useState(false);

  async function finishOnboarding() {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age, 10);
    if (!w || !h || !a) {
      Alert.alert("Missing info", "Please fill in weight, height, and age.");
      return;
    }
    const activityFactor = ACTIVITY_LEVELS.find((l) => l.id === activityLevel).factor;
    const tdee = calcTDEE({ weightKg: w, heightCm: h, age: a, sex, activityFactor });

    let calorieTarget = tdee;
    if (goal === "lose") calorieTarget = tdee - 500; // ~0.5kg/week deficit
    if (goal === "gain") calorieTarget = tdee + 300;

    const proteinTargetG = Math.round(w * (goal === "gain" ? 1.8 : 1.4));
    const fatTargetG = Math.round((calorieTarget * 0.27) / 9);
    const carbsTargetG = Math.round((calorieTarget - proteinTargetG * 4 - fatTargetG * 9) / 4);

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        goal,
        activityLevel,
        weightKg: w,
        heightCm: h,
        age: a,
        sex,
        dailyCalorieTarget: calorieTarget,
        dailyCalorieBurnTarget: tdee,
        proteinTargetG,
        carbsTargetG,
        fatTargetG,
        onboardingComplete: true,
      });
      await refreshProfile();
    } catch (e) {
      Alert.alert("Couldn't save", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.progressRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
          ))}
        </View>

        {step === 0 && (
          <>
            <Text style={styles.title}>What's your main goal?</Text>
            <Text style={styles.subtitle}>This shapes your daily calorie and macro targets.</Text>
            {GOALS.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.optionCard, goal === g.id && styles.optionCardActive]}
                onPress={() => setGoal(g.id)}
              >
                <Text style={styles.optionLabel}>{g.label}</Text>
                <Text style={styles.optionDesc}>{g.desc}</Text>
              </TouchableOpacity>
            ))}
            <Button title="Continue" onPress={() => goal && setStep(1)} disabled={!goal} style={{ marginTop: 16 }} />
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>How active are you?</Text>
            <Text style={styles.subtitle}>Used to estimate your baseline calorie burn.</Text>
            {ACTIVITY_LEVELS.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.optionCard, activityLevel === l.id && styles.optionCardActive]}
                onPress={() => setActivityLevel(l.id)}
              >
                <Text style={styles.optionLabel}>{l.label}</Text>
                <Text style={styles.optionDesc}>{l.desc}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Button title="Back" variant="outline" onPress={() => setStep(0)} style={{ flex: 1 }} />
              <Button title="Continue" onPress={() => activityLevel && setStep(2)} disabled={!activityLevel} style={{ flex: 1 }} />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>A few quick details</Text>
            <Text style={styles.subtitle}>Used only to calculate your personal targets.</Text>
            <FormInput label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="65" />
            <FormInput label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="170" />
            <FormInput label="Age" value={age} onChangeText={setAge} keyboardType="numeric" placeholder="28" />
            <Text style={styles.label}>Sex</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              {["female", "male"].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sexChip, sex === s && styles.sexChipActive]}
                  onPress={() => setSex(s)}
                >
                  <Text style={[styles.sexChipText, sex === s && { color: "#fff" }]}>
                    {s === "female" ? "Female" : "Male"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Back" variant="outline" onPress={() => setStep(1)} style={{ flex: 1 }} />
              <Button title="Finish" onPress={finishOnboarding} loading={saving} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 24, paddingTop: 20 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 24 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.border },
  progressDotActive: { backgroundColor: theme.colors.primary },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display, marginBottom: 6 },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 20 },
  optionCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  optionCardActive: { borderColor: theme.colors.primary, backgroundColor: "#2F6B4F0D" },
  optionLabel: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  optionDesc: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.textSubtle, marginBottom: 6 },
  sexChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.chipBorder,
    alignItems: "center",
  },
  sexChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  sexChipText: { fontWeight: "600", color: theme.colors.text },
});
