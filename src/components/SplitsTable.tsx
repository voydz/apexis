import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DistanceUnit, Split } from '../types';
import { colors, numericFont, spacing, typography } from '../theme';
import { formatElevation, formatPace } from '../utils/format';

/**
 * Split list with relative pace bars: the fastest split gets a full-width
 * accent bar, slower splits proportionally shorter ones.
 */
export function SplitsTable({ splits, unit }: { splits: Split[]; unit: DistanceUnit }) {
  if (splits.length === 0) {
    return <Text style={typography.caption}>No completed splits yet.</Text>;
  }

  const paces = splits.map((s) => s.paceSecPerKm);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const range = Math.max(slowest - fastest, 1);

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.colIndex]}>{unit === 'metric' ? 'KM' : 'MI'}</Text>
        <Text style={[styles.headerCell, styles.colPace]}>PACE</Text>
        <Text style={[styles.headerCell, styles.colBar]} />
        <Text style={[styles.headerCell, styles.colElev]}>ELEV</Text>
      </View>
      {splits.map((s) => {
        const isPartial = s.distanceM < (unit === 'metric' ? 995 : 1600);
        const frac = 1 - Math.min(1, Math.max(0, (s.paceSecPerKm - fastest) / range)) * 0.75;
        const isFastest = s.paceSecPerKm === fastest && splits.length > 1;
        return (
          <View key={s.index} style={styles.row}>
            <Text style={[styles.cell, styles.colIndex]}>
              {isPartial ? (s.distanceM / (unit === 'metric' ? 1000 : 1609.344)).toFixed(1) : s.index}
            </Text>
            <Text style={[styles.cell, styles.colPace, isFastest && { color: colors.accent }]}>
              {formatPace(s.paceSecPerKm, unit)}
            </Text>
            <View style={styles.colBar}>
              <View
                style={[
                  styles.bar,
                  {
                    width: `${Math.round(frac * 100)}%`,
                    backgroundColor: isFastest ? colors.accent : colors.surfaceAlt,
                  },
                ]}
              />
            </View>
            <Text style={[styles.cell, styles.colElev]}>
              {s.elevationChangeM >= 0 ? '+' : ''}
              {formatElevation(s.elevationChangeM, unit)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    gap: spacing.s,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  headerCell: {
    ...typography.label,
    fontSize: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 14,
    color: colors.text,
    ...numericFont,
  },
  colIndex: { width: 36 },
  colPace: { width: 56 },
  colBar: { flex: 1, paddingHorizontal: spacing.s, justifyContent: 'center' },
  colElev: { width: 48, textAlign: 'right', color: colors.textSecondary },
  bar: {
    height: 8,
    borderRadius: 4,
    minWidth: 8,
  },
});
