import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { theme } from "../theme";

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
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, color: theme.colors.textMuted },
});
