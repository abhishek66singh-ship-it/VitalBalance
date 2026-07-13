import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import { theme } from "../theme";

export default function LoginScreen({ navigation }) {
  const { signInWithEmail, signInWithGoogle, googleRequestReady, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleEmailSignIn() {
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (e) {
      Alert.alert("Sign in failed", authError || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>VitalBalance</Text>
          <Text style={styles.tagline}>Your daily energy balance, effortlessly tracked.</Text>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>

            <FormInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <FormInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
              secureTextEntry
            />

            {authError ? (
              <Text style={{ color: theme.colors.error || "red", textAlign: "center", marginBottom: 12, marginTop: 4 }}>
                {authError}
              </Text>
            ) : null}

            <Button title="Sign In" onPress={handleEmailSignIn} loading={loading} style={{ marginTop: 4 }} />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              title="Continue with Google"
              variant="secondary"
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              disabled={!googleRequestReady}
            />

            <Text style={styles.switchText}>
              Don't have an account?{" "}
              <Text style={styles.switchLink} onPress={() => navigation.navigate("SignUp")}>
                Sign up
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo: { fontSize: 30, fontWeight: "700", color: theme.colors.text, textAlign: "center", fontFamily: theme.fonts.display },
  tagline: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", marginTop: 6, marginBottom: 28 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: theme.colors.border },
  title: { fontSize: 19, fontWeight: "700", color: theme.colors.text, marginBottom: 16, fontFamily: theme.fonts.display },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { marginHorizontal: 10, fontSize: 12, color: theme.colors.textMuted },
  switchText: { textAlign: "center", marginTop: 18, fontSize: 13, color: theme.colors.textMuted },
  switchLink: { color: theme.colors.primary, fontWeight: "700" },
});
