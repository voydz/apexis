import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Run, TrackPoint } from '../types';
import { listRuns, getRoutePreviewPoints } from '../db/runRepository';
import { Screen, EmptyState } from '../components/ui';
import { RoutePreview } from '../components/RoutePreview';
import { useSettings } from '../settings/SettingsContext';
import { colors, radius, spacing, typography } from '../theme';
import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatDateTime,
  formatPace,
  paceUnitLabel,
} from '../utils/format';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HistoryScreen() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [previews, setPreviews] = useState<Record<string, TrackPoint[]>>({});
  const { settings } = useSettings();
  const navigation = useNavigation<Nav>();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const loaded = await listRuns();
        if (cancelled) return;
        setRuns(loaded);
        for (const run of loaded) {
          if (previews[run.id]) continue;
          const pts = await getRoutePreviewPoints(run.id);
          if (cancelled) return;
          setPreviews((prev) => ({ ...prev, [run.id]: pts }));
        }
      })().catch(() => {});
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const unit = settings.unit;

  const renderItem = ({ item }: { item: Run }) => {
    const avgPace = item.distanceM > 0 ? item.movingMs / 1000 / (item.distanceM / 1000) : null;
    return (
      <Pressable
        onPress={() => navigation.navigate('RunDetail', { id: item.id })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDate}>{formatDateTime(item.startedAt)}</Text>
          <View style={styles.cardStats}>
            <View>
              <Text style={styles.cardStatValue}>
                {formatDistance(item.distanceM, unit)}
                <Text style={styles.cardStatUnit}> {distanceUnitLabel(unit)}</Text>
              </Text>
            </View>
            <View>
              <Text style={styles.cardStatValue}>{formatDuration(item.movingMs)}</Text>
            </View>
            <View>
              <Text style={styles.cardStatValue}>
                {formatPace(avgPace, unit)}
                <Text style={styles.cardStatUnit}>{paceUnitLabel(unit)}</Text>
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.cardRight}>
          <RoutePreview points={previews[item.id] ?? []} width={84} height={84} />
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Text style={styles.title}>History</Text>
      <FlatList
        data={runs}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No runs yet"
            subtitle="Head to the Track tab and start your first run — it will show up here."
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    paddingBottom: spacing.m,
  },
  list: {
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.xl,
    gap: spacing.m,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.m,
    gap: spacing.m,
  },
  cardLeft: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    ...typography.heading,
  },
  cardDate: {
    ...typography.caption,
    marginBottom: spacing.s,
  },
  cardStats: {
    flexDirection: 'row',
    gap: spacing.l,
  },
  cardStatValue: {
    ...typography.statMedium,
    fontSize: 17,
  },
  cardStatUnit: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textTertiary,
  },
  cardRight: {
    width: 84,
    height: 84,
    borderRadius: radius.s,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
