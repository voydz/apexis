import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';
import { colors, typography } from '../theme';

interface Point {
  x: number;
  y: number;
}

function useMeasuredWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(e.nativeEvent.layout.width)];
}

/**
 * Area line chart. `invertY` renders lower values at the top —
 * useful for pace, where faster (smaller) should read as "higher".
 */
export function AreaChart({
  data,
  height = 140,
  color = colors.accent,
  invertY = false,
  formatY,
  gradientId,
}: {
  data: Point[];
  height?: number;
  color?: string;
  invertY?: boolean;
  formatY?: (y: number) => string;
  gradientId: string;
}) {
  const [width, onLayout] = useMeasuredWidth();

  if (data.length < 2) {
    return (
      <View onLayout={onLayout} style={[styles.chartEmpty, { height }]}>
        <Text style={typography.caption}>Not enough data</Text>
      </View>
    );
  }

  const pad = { top: 10, bottom: 4, left: 0, right: 0 };
  const innerH = height - pad.top - pad.bottom;

  const xs = data.map((p) => p.x);
  const ys = data.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (maxY - minY < 1e-6) {
    minY -= 1;
    maxY += 1;
  }
  const yPad = (maxY - minY) * 0.12;
  minY -= yPad;
  maxY += yPad;

  const toX = (x: number) => ((x - minX) / (maxX - minX)) * width;
  const toY = (y: number) => {
    const t = (y - minY) / (maxY - minY);
    const tt = invertY ? t : 1 - t;
    return pad.top + tt * innerH;
  };

  const line = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  const bestLabel = formatY ? formatY(invertY ? Math.min(...ys) : Math.max(...ys)) : null;
  const worstLabel = formatY ? formatY(invertY ? Math.max(...ys) : Math.min(...ys)) : null;

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((t) => (
              <Line
                key={t}
                x1={0}
                x2={width}
                y1={pad.top + innerH * t}
                y2={pad.top + innerH * t}
                stroke={colors.chartGrid}
                strokeWidth={1}
              />
            ))}
            <Path d={area} fill={`url(#${gradientId})`} />
            <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
          </Svg>
          {formatY && (
            <View style={styles.chartLabels}>
              <Text style={styles.chartLabel}>{worstLabel}</Text>
              <Text style={styles.chartLabel}>{bestLabel}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

export function BarChart({
  data,
  height = 150,
  formatValue,
  highlightIndex,
}: {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  highlightIndex?: number;
}) {
  const [width, onLayout] = useMeasuredWidth();
  const max = Math.max(...data.map((d) => d.value), 1e-9);
  const labelH = 18;
  const valueH = formatValue ? 16 : 0;
  const barAreaH = height - labelH - valueH;

  if (data.length === 0) {
    return (
      <View onLayout={onLayout} style={[styles.chartEmpty, { height }]}>
        <Text style={typography.caption}>No data</Text>
      </View>
    );
  }

  const gap = data.length > 16 ? 3 : 8;
  const barW = width > 0 ? Math.max(4, (width - gap * (data.length - 1)) / data.length) : 0;

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <>
          <Svg width={width} height={barAreaH}>
            {data.map((d, i) => {
              const h = d.value <= 0 ? 3 : Math.max(3, (d.value / max) * (barAreaH - 4));
              const x = i * (barW + gap);
              const active = highlightIndex === i || (highlightIndex == null && d.value === max);
              return (
                <Rect
                  key={i}
                  x={x}
                  y={barAreaH - h}
                  width={barW}
                  height={h}
                  rx={Math.min(5, barW / 2)}
                  fill={d.value <= 0 ? colors.chartGrid : active ? colors.accent : colors.surfaceAlt}
                  stroke={d.value > 0 && !active ? colors.border : 'none'}
                  strokeWidth={d.value > 0 && !active ? 1 : 0}
                />
              );
            })}
          </Svg>
          <View style={[styles.barLabels, { gap }]}>
            {data.map((d, i) => (
              <Text key={i} style={[styles.chartLabel, { width: barW, textAlign: 'center' }]} numberOfLines={1}>
                {d.label}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  chartLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  barLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
});
