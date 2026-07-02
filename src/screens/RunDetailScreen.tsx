import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RunWithPoints } from '../types';
import { deleteRun, getRunWithPoints } from '../db/runRepository';
import { Screen, Card, SectionTitle, StatTile } from '../components/ui';
import { RunMap } from '../components/RunMap';
import { AreaChart } from '../components/charts';
import { SplitsTable } from '../components/SplitsTable';
import { useSettings } from '../settings/SettingsContext';
import { colors, spacing, typography } from '../theme';
import {
  distanceUnitLabel,
  elevationUnitLabel,
  formatDistance,
  formatDuration,
  formatDateTime,
  formatElevation,
  formatPace,
  formatSpeed,
  paceUnitLabel,
  speedUnitLabel,
  splitLengthM,
  KM_PER_MILE,
  FEET_PER_METER,
} from '../utils/format';
import { computeSplits, elevationSeries, paceSeries } from '../utils/analysis';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'RunDetail'>;

export function RunDetailScreen() {
  const { params } = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { settings } = useSettings();
  const [run, setRun] = useState<RunWithPoints | null>(null);
  const [loading, setLoading] = useState(true);

  const unit = settings.unit;

  useEffect(() => {
    getRunWithPoints(params.id)
      .then(setRun)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  const splits = useMemo(
    () => (run ? computeSplits(run.points, splitLengthM(unit)) : []),
    [run, unit]
  );
  const pace = useMemo(() => (run ? paceSeries(run.points) : []), [run]);
  const elevation = useMemo(() => (run ? elevationSeries(run.points) : []), [run]);

  const handleDelete = () => {
    Alert.alert('Delete run?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRun(params.id);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (!run) {
    return (
      <Screen style={styles.center}>
        <Text style={typography.body}>Run not found.</Text>
      </Screen>
    );
  }

  const avgPace = run.distanceM > 0 ? run.movingMs / 1000 / (run.distanceM / 1000) : null;

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={typography.title}>{run.title}</Text>
            <Text style={typography.caption}>{formatDateTime(run.startedAt)}</Text>
          </View>
          <Pressable onPress={handleDelete} hitSlop={12}>
            <Text style={styles.deleteLabel}>Delete</Text>
          </Pressable>
        </View>

        <RunMap points={run.points} style={styles.map} />

        <View style={styles.heroGrid}>
          <StatTile
            label={`Distance ${distanceUnitLabel(unit)}`}
            value={formatDistance(run.distanceM, unit)}
            large
            accent
          />
          <StatTile label="Time" value={formatDuration(run.movingMs)} large />
          <StatTile label={`Avg ${paceUnitLabel(unit)}`} value={formatPace(avgPace, unit)} large />
        </View>

        <Card>
          <View style={styles.detailGrid}>
            <StatTile label="Elapsed" value={formatDuration(run.elapsedMs)} />
            <StatTile
              label={`Avg ${speedUnitLabel(unit)}`}
              value={formatSpeed(
                run.movingMs > 0 ? run.distanceM / (run.movingMs / 1000) : null,
                unit
              )}
            />
            <StatTile label={`Max ${speedUnitLabel(unit)}`} value={formatSpeed(run.maxSpeedMs, unit)} />
          </View>
          <View style={[styles.detailGrid, { marginTop: spacing.m }]}>
            <StatTile
              label={`Climb ${elevationUnitLabel(unit)}`}
              value={formatElevation(run.elevationGainM, unit)}
            />
            <StatTile
              label={`Descent ${elevationUnitLabel(unit)}`}
              value={formatElevation(run.elevationLossM, unit)}
            />
            <StatTile
              label="kcal"
              value={run.caloriesKcal != null ? Math.round(run.caloriesKcal).toString() : '--'}
            />
          </View>
          <View style={[styles.detailGrid, { marginTop: spacing.m }]}>
            <StatTile
              label="Steps"
              value={run.steps != null ? run.steps.toLocaleString() : '--'}
            />
            <StatTile
              label="Cadence spm"
              value={run.avgCadenceSpm != null ? Math.round(run.avgCadenceSpm).toString() : '--'}
            />
          </View>
        </Card>

        {(run.best1kS != null || run.best5kS != null || run.best10kS != null) && (
          <>
            <SectionTitle>Best efforts</SectionTitle>
            <Card>
              <View style={styles.detailGrid}>
                <StatTile
                  label="1k"
                  value={run.best1kS != null ? formatDuration(run.best1kS * 1000) : '--'}
                />
                <StatTile
                  label="5k"
                  value={run.best5kS != null ? formatDuration(run.best5kS * 1000) : '--'}
                />
                <StatTile
                  label="10k"
                  value={run.best10kS != null ? formatDuration(run.best10kS * 1000) : '--'}
                />
              </View>
            </Card>
          </>
        )}

        <SectionTitle>Pace</SectionTitle>
        <Card>
          <AreaChart
            data={pace.map((p) => ({
              x: p.x,
              y: unit === 'metric' ? p.y : p.y * KM_PER_MILE,
            }))}
            invertY
            gradientId="paceGrad"
            formatY={(y) => formatPace(unit === 'metric' ? y : y / KM_PER_MILE, unit)}
          />
        </Card>

        <SectionTitle>Elevation</SectionTitle>
        <Card>
          <AreaChart
            data={elevation.map((p) => ({
              x: p.x,
              y: unit === 'metric' ? p.y : p.y * FEET_PER_METER,
            }))}
            color={colors.blue}
            gradientId="elevGrad"
            formatY={(y) => `${Math.round(y)} ${elevationUnitLabel(unit)}`}
          />
        </Card>

        <SectionTitle>Splits</SectionTitle>
        <Card>
          <SplitsTable splits={splits} unit={unit} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.m,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.m,
    gap: spacing.m,
  },
  deleteLabel: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: '700',
    paddingTop: 6,
  },
  map: {
    height: 220,
    marginBottom: spacing.l,
  },
  heroGrid: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: spacing.m,
  },
});
