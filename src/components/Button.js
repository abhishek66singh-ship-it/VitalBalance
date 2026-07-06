import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { theme } from "../theme";

export default function Button({
  title,
  onPress,
  variant = "primary", // "primary" | "secondary" | "outline"
  loading = false,
  disabled = false,
  icon = null,
  style,
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "outline" && styles.outline,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? theme.colors.primary : "#fff"} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              variant === "outline" && { color: theme.colors.primary },
              variant === "secondary" && { color: theme.colors.text },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.colors.border },
  outline: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: theme.colors.primary },
  disabled: { opacity: 0.5 },
  text: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
