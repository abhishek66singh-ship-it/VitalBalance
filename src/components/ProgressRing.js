import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { theme } from "../theme";

let Svg, Circle;
try {
  const rnSvg = require("react-native-svg");
  Svg = rnSvg.Svg || rnSvg.default;
  Circle = rnSvg.Circle;
} catch {
  Svg = null;
}

export default function ProgressRing({ consumed, target, size = 132, strokeWidth = 12 }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;

  // Web fallback: simple percentage bar
  if (!Svg) {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={[styles.value, { fontSize: 18 }]}>{Math.round(consumed)}</Text>
        <Text style={styles.label}>of {Math.round(target)} kcal</Text>
        <View style={{ width: size - 20, height: 8, backgroundColor: theme.colors.border, borderRadius: 4, marginTop: 8 }}>
          <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: theme.colors.primary, borderRadius: 4 }} />
        </View>
      </View>
    );
  }

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c - pct * c}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject}>
        <View style={styles.center}>
          <Text style={styles.value}>{Math.round(consumed)}</Text>
          <Text style={styles.label}>of {Math.round(target)} kcal</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 22, fontWeight: "700", color: theme.colors.text, fontFamily: theme.fonts.display },
  label: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
