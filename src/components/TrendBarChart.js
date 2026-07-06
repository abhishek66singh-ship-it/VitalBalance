import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { theme } from "../theme";

// On web, react-native-svg renders as inline SVG via react-native-web.
// We use a conditional import to avoid crashes if the web bundle
// doesn't resolve the native SVG module correctly.
let Svg, Rect, Line, SvgText;
try {
  const rnSvg = require("react-native-svg");
  Svg = rnSvg.Svg || rnSvg.default;
  Rect = rnSvg.Rect;
  Line = rnSvg.Line;
  SvgText = rnSvg.Text;
} catch {
  Svg = null;
}

// Simple dual-bar chart: for each day/period, draws a "burned" bar and a
// "consumed" bar side by side. Pure SVG (react-native-svg), no extra
// dependency, works the same on iOS/Android/web.
//
// data: [{ label: string, burned: number, consumed: number }, ...]
export default function TrendBarChart({ data, height = 180 }) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Not enough data yet</Text>
      </View>
    );
  }

  // Web fallback: if SVG module didn't load, show a simple text-based summary
  if (!Svg) {
    return (
      <View style={{ paddingVertical: 8 }}>
        {data.map((d, i) => (
          <View key={i} style={styles.fallbackRow}>
            <Text style={styles.fallbackLabel}>{d.label}</Text>
            <View style={styles.fallbackBars}>
              <View style={[styles.fallbackBar, { width: `${Math.min((d.burned / 2500) * 100, 100)}%`, backgroundColor: theme.colors.primary }]} />
              <View style={[styles.fallbackBar, { width: `${Math.min((d.consumed / 2500) * 100, 100)}%`, backgroundColor: theme.colors.accentWarn, marginTop: 2 }]} />
            </View>
            <Text style={styles.fallbackValue}>{d.burned}/{d.consumed}</Text>
          </View>
        ))}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
            <Text style={styles.legendText}>Burned</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.accentWarn }]} />
            <Text style={styles.legendText}>Consumed</Text>
          </View>
        </View>
      </View>
    );
  }

  const width = 680; // matches the card's inner content width; scales via parent
  const paddingLeft = 36;
  const paddingBottom = 28;
  const paddingTop = 12;
  const chartW = width - paddingLeft - 12;
  const chartH = height - paddingTop - paddingBottom;

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.burned, d.consumed)),
    100
  );
  const niceMax = Math.ceil(maxVal / 500) * 500;

  const groupW = chartW / data.length;
  const barW = Math.min(14, groupW * 0.28);
  const gap = 4;

  function yFor(v) {
    return paddingTop + chartH - (v / niceMax) * chartH;
  }

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* gridlines */}
        {[0, 0.5, 1].map((frac) => {
          const y = paddingTop + chartH - frac * chartH;
          return (
            <Line
              key={frac}
              x1={paddingLeft}
              y1={y}
              x2={width - 8}
              y2={y}
              stroke={theme.colors.border}
              strokeWidth={1}
            />
          );
        })}
        <SvgText x={4} y={yFor(0) + 4} fontSize="9" fill={theme.colors.textMuted}>0</SvgText>
        <SvgText x={4} y={yFor(niceMax) + 4} fontSize="9" fill={theme.colors.textMuted}>
          {niceMax >= 1000 ? `${(niceMax / 1000).toFixed(1)}k` : niceMax}
        </SvgText>

        {data.map((d, i) => {
          const groupX = paddingLeft + i * groupW + groupW / 2;
          const burnedX = groupX - barW - gap / 2;
          const consumedX = groupX + gap / 2;
          const burnedY = yFor(d.burned);
          const consumedY = yFor(d.consumed);
          return (
            <React.Fragment key={i}>
              <Rect
                x={burnedX}
                y={burnedY}
                width={barW}
                height={paddingTop + chartH - burnedY}
                rx={3}
                fill={theme.colors.primary}
              />
              <Rect
                x={consumedX}
                y={consumedY}
                width={barW}
                height={paddingTop + chartH - consumedY}
                rx={3}
                fill={theme.colors.accentWarn}
              />
              <SvgText
                x={groupX}
                y={height - 8}
                fontSize="9"
                fill={theme.colors.textMuted}
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
          <Text style={styles.legendText}>Burned</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.accentWarn }]} />
          <Text style={styles.legendText}>Consumed</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 12, color: theme.colors.textMuted },
  fallbackRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  fallbackLabel: { width: 24, fontSize: 10, color: theme.colors.textMuted },
  fallbackBars: { flex: 1 },
  fallbackBar: { height: 6, borderRadius: 3 },
  fallbackValue: { fontSize: 9, color: theme.colors.textMuted, width: 60, textAlign: "right" },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, color: theme.colors.textMuted },
});
