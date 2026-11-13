import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Run } from '../types';
import { listRuns } from '../db/runRepository';
import { Screen, Card, SectionTitle, SegmentedControl, StatTile, EmptyState } from '../components/ui';
import { BarChart } from '../components/charts';
import { useSettings } from '../settings/SettingsContext';
import { colors, radius, spacing, typography } from '../theme';
import {
  computeRecords,
  computeTotals,
  computeTrend,
  filterByPeriod,
  topEfforts,
  EffortEntry,
  Period,
} from '../stats/aggregates';
import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatDate,
  formatElevation,
  formatPace,
  elevationUnitLabel,
  paceUnitLabel,
} from '../utils/format';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

const TROPHIES = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

export function StatsScreen() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const { settings } = useSettings();
  const navigation = useNavigation<Nav>();
  const unit = settings.unit;

  useFocusEffect(
    useCallback(() => {
      listRuns().then(setRuns).catch(() => {});
    }, [])
  );

  const periodRuns = useMemo(() => filterByPeriod(runs, period), [runs, period]);
  const totals = useMemo(() => computeTotals(periodRuns), [periodRuns]);
  const trend = useMemo(() => computeTrend(periodRuns, period), [periodRuns, period]);
  const records = useMemo(() => computeRecords(runs), [runs]);
  const bestEfforts = useMemo(
    () =>
      [
        { label: 'Fastest 1 km', entries: topEfforts(runs, 'best1kS') },
        { label: 'Fastest 5 km', entries: topEfforts(runs, 'best5kS') },
        { label: 'Fastest 10 km', entries: topEfforts(runs, 'best10kS') },
      ].filter((s) => s.entries.length > 0),
    [runs]
  );

  const recordRows: { label: string; value: string; run: Run | null }[] = [
    {
      label: 'Longest run',
      value: records.longestRun
        ? `${formatDistance(records.longestRun.distanceM, unit)} ${distanceUnitLabel(unit)}`
        : '--',
      run: records.longestRun,
    },
    {
      label: 'Best avg pace',
      value: records.bestAvgPace
        ? `${formatPace(
            records.bestAvgPace.movingMs / 1000 / (records.bestAvgPace.distanceM / 1000),
            unit
          )}${paceUnitLabel(unit)}`
        : '--',
      run: records.bestAvgPace,
    },
    {
      label: 'Biggest climb',
      value: records.biggestClimb
        ? `${formatElevation(records.biggestClimb.elevationGainM, unit)} ${elevationUnitLabel(unit)}`
        : '--',
      run: records.biggestClimb,
    },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={typography.title}>Statistics</Text>

        <View style={styles.periodControl}>
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        </View>

        {runs.length === 0 ? (
          <EmptyState
            title="Nothing to analyze yet"
            subtitle="Your totals, trends and personal records will appear once you record your first run."
          />
        ) : (
          <>
            <Card>
              <View style={styles.totalsGrid}>
                <StatTile
                  label={`Distance ${distanceUnitLabel(unit)}`}
                  value={formatDistance(totals.distanceM, unit, 1)}
                  large
                  accent
                />
                <StatTile label="Time" value={formatDuration(totals.movingMs)} large />
              </View>
              <View style={[styles.totalsGrid, { marginTop: spacing.m }]}>
                <StatTile label="Runs" value={totals.runs.toString()} />
                <StatTile
                  label={`Climb ${elevationUnitLabel(unit)}`}
                  value={formatElevation(totals.elevationGainM, unit)}
                />
                <StatTile
                  label={`Avg ${paceUnitLabel(unit)}`}
                  value={formatPace(totals.avgPaceSecPerKm, unit)}
                />
                <StatTile label="kcal" value={Math.round(totals.caloriesKcal).toString()} />
              </View>
            </Card>

            <SectionTitle>
              Distance {period === 'week' ? 'per day' : period === 'month' ? 'per week' : 'per month'}
            </SectionTitle>
            <Card>
              <BarChart
                data={trend.map((b) => ({
                  label: b.label,
                  value: b.distanceM,
                }))}
              />
            </Card>

            <SectionTitle>Personal records — all time</SectionTitle>
            <Card style={{ paddingVertical: spacing.s }}>
              {recordRows.map((row, i) => (
                <Pressable
                  key={row.label}
                  disabled={!row.run}
                  onPress={() => row.run && navigation.navigate('RunDetail', { id: row.run.id })}
                  style={({ pressed }) => [
                    styles.recordRow,
                    i < recordRows.length - 1 && styles.recordRowBorder,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordLabel}>{row.label}</Text>
                    {row.run && (
                      <Text style={styles.recordDate}>{formatDate(row.run.startedAt)}</Text>
                    )}
                  </View>
                  <Text style={styles.recordValue}>{row.value}</Text>
                </Pressable>
              ))}
            </Card>

            {bestEfforts.map((section) => (
              <React.Fragment key={section.label}>
                <SectionTitle>{`${section.label} — top ${section.entries.length}`}</SectionTitle>
                <Card style={{ paddingVertical: spacing.s }}>
                  {section.entries.map((entry: EffortEntry, i: number) => (
                    <Pressable
                      key={entry.run.id}
                      onPress={() => navigation.navigate('RunDetail', { id: entry.run.id })}
                      style={({ pressed }) => [
                        styles.recordRow,
                        i < section.entries.length - 1 && styles.recordRowBorder,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.rankBadge}>{TROPHIES[i] ?? `${i + 1}.`}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recordLabel}>{entry.run.title}</Text>
                        <Text style={styles.recordDate}>{formatDate(entry.run.startedAt)}</Text>
                      </View>
                      <Text style={styles.recordValue}>
                        {formatDuration(entry.seconds * 1000)}
                      </Text>
                    </Pressable>
                  ))}
                </Card>
              </React.Fragment>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.m,
    paddingBottom: spacing.xxl,
  },
  periodControl: {
    marginTop: spacing.m,
    marginBottom: spacing.l,
  },
  totalsGrid: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.m - 2,
  },
  rankBadge: {
    ...typography.body,
    fontSize: 18,
    width: 30,
    textAlign: 'center',
  },
  recordRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recordLabel: {
    ...typography.body,
    fontWeight: '600',
  },
  recordDate: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 1,
  },
  recordValue: {
    ...typography.statMedium,
    fontSize: 18,
    color: colors.accent,
  },
});
