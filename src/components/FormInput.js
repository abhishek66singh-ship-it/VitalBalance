import React from "react";
import { TextInput, View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

export default function FormInput({ label, error, style, ...props }) {
  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, error && styles.inputError]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.textSubtle, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  inputError: { borderColor: theme.colors.accentWarn },
  error: { fontSize: 12, color: theme.colors.accentWarn, marginTop: 4 },
});
