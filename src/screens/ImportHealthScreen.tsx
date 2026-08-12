import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLinkedHealthUuids } from '../db/runRepository';
import { healthStoreLabel, listHealthWorkouts, type HealthWorkoutSummary } from '../health';
import { importHealthWorkout } from '../health/importRun';
import { useSettings } from '../settings/SettingsContext';
import { EmptyState, PillButton, Screen } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';
import { formatDate, formatDistance, formatDuration } from '../utils/format';

type ItemStatus = 'importing' | 'done' | 'failed';

export function ImportHealthScreen() {
  const { settings } = useSettings();
  const [workouts, setWorkouts] = useState<HealthWorkoutSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<Record<string, ItemStatus>>({});
  const [importingAll, setImportingAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  const weightKgRef = useRef(settings.weightKg);
  weightKgRef.current = settings.weightKg;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listHealthWorkouts(), getLinkedHealthUuids()])
      .then(([all, linked]) => {
        if (cancelled) return;
        setWorkouts(all.filter((w) => !linked.has(w.id)));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
      cancelRef.current = true;
    };
  }, []);

  const setItemStatus = (id: string, s: ItemStatus) =>
    setStatus((prev) => ({ ...prev, [id]: s }));

  const importOne = useCallback(async (id: string, allowConsentPrompt: boolean) => {
    setItemStatus(id, 'importing');
    try {
      const runId = await importHealthWorkout(id, {
        weightKg: weightKgRef.current,
        allowConsentPrompt,
      });
      setItemStatus(id, runId ? 'done' : 'failed');
      return runId != null;
    } catch {
      setItemStatus(id, 'failed');
      return false;
    }
  }, []);

  const handleImportAll = useCallback(async () => {
    if (!workouts) return;
    const remaining = workouts.filter((w) => status[w.id] !== 'done');
    cancelRef.current = false;
    setImportingAll(true);
    setProgress({ done: 0, total: remaining.length });
    // Sequential on purpose: each run commits in its own transaction, so a
    // cancelled or interrupted bulk import loses nothing.
    for (let i = 0; i < remaining.length; i++) {
      if (cancelRef.current) break;
      await importOne(remaining[i].id, false);
      setProgress({ done: i + 1, total: remaining.length });
    }
    setImportingAll(false);
    setProgress(null);
  }, [workouts, status, importOne]);

  const pendingCount = workouts
    ? workouts.filter((w) => status[w.id] !== 'done').length
    : 0;

  if (loadError) {
    return (
      <Screen edges={[]} style={styles.center}>
        <EmptyState
          title="Could not load workouts"
          subtitle={`Check that Apex has read access to ${healthStoreLabel()} and try again.`}
        />
      </Screen>
    );
  }

  if (!workouts) {
    return (
      <Screen edges={[]} style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <FlatList
        data={workouts}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Running workouts from other apps in {healthStoreLabel()}. Imported runs appear in
            your history like any other run.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing to import"
            subtitle={`No new running workouts were found in ${healthStoreLabel()}.`}
          />
        }
        renderItem={({ item }) => (
          <WorkoutRow
            workout={item}
            status={status[item.id]}
            unit={settings.unit}
            disabled={importingAll}
            onImport={() => importOne(item.id, true)}
          />
        )}
      />
      {workouts.length > 0 && pendingCount > 0 && (
        <View style={styles.footer}>
          {importingAll ? (
            <PillButton
              label={progress ? `Importing ${progress.done} of ${progress.total}… Cancel` : 'Cancel'}
              variant="ghost"
              onPress={() => {
                cancelRef.current = true;
              }}
            />
          ) : (
            <PillButton
              label={`Import all (${pendingCount})`}
              onPress={handleImportAll}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

function WorkoutRow({
  workout,
  status,
  unit,
  disabled,
  onImport,
}: {
  workout: HealthWorkoutSummary;
  status: ItemStatus | undefined;
  unit: 'metric' | 'imperial';
  disabled: boolean;
  onImport: () => void;
}) {
  const distance =
    workout.distanceM != null ? `${formatDistance(workout.distanceM, unit)} ${unit === 'metric' ? 'km' : 'mi'}` : null;
  const details = [formatDate(workout.startedAt), distance, formatDuration(workout.durationMs)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{workout.sourceName}</Text>
        <Text style={styles.rowSubtitle}>{details}</Text>
      </View>
      {status === 'importing' ? (
        <ActivityIndicator color={colors.accent} />
      ) : status === 'done' ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
      ) : (
        <Pressable onPress={onImport} disabled={disabled} hitSlop={8}>
          <Text style={[styles.importLabel, disabled && { opacity: 0.4 }]}>
            {status === 'failed' ? 'Retry' : 'Import'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  intro: {
    ...typography.caption,
    lineHeight: 18,
    marginBottom: spacing.m,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.m,
    marginBottom: spacing.s,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  rowSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  importLabel: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    bottom: spacing.l,
  },
});
