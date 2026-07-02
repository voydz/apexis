import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, StatTile, PillButton } from '../components/ui';
import { RunMap } from '../components/RunMap';
import { useTracking } from '../tracking/useTracking';
import { trackingEngine } from '../tracking/engine';
import { useSettings } from '../settings/SettingsContext';
import { colors, radius, spacing, typography } from '../theme';
import {
  distanceUnitLabel,
  elevationUnitLabel,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  paceUnitLabel,
  speedUnitLabel,
} from '../utils/format';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TrackScreen() {
  const stats = useTracking();
  const { settings } = useSettings();
  const navigation = useNavigation<Nav>();
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const unit = settings.unit;
  const isActive = stats.state !== 'idle';
  const isPausedState = stats.state === 'paused' || stats.state === 'autoPaused';

  useEffect(() => {
    if (isActive) {
      activateKeepAwakeAsync('tracking').catch(() => {});
      return () => {
        deactivateKeepAwake('tracking').catch(() => {});
      };
    }
  }, [isActive]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) {
        Alert.alert(
          'Location needed',
          'Apexis needs location access to track your run. Enable it in system settings.'
        );
        return;
      }
      // Background permission is optional but recommended (screen off / other apps)
      await Location.requestBackgroundPermissionsAsync().catch(() => {});
      await trackingEngine.start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not start tracking', String(e));
    } finally {
      setStarting(false);
    }
  }, []);

  const handleDiscard = useCallback(() => {
    Alert.alert('Discard run?', 'This run will be deleted permanently.', [
      { text: 'Keep running', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await trackingEngine.discard();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        },
      },
    ]);
  }, []);

  const handleStop = useCallback(() => {
    Alert.alert('Finish run?', 'The run will be saved to your history.', [
      { text: 'Keep running', style: 'cancel' },
      {
        text: 'Finish',
        style: 'destructive',
        onPress: async () => {
          setStopping(true);
          try {
            const run = await trackingEngine.stop();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            if (run) {
              navigation.navigate('RunDetail', { id: run.id });
            } else {
              Alert.alert('Run discarded', 'Runs shorter than 50 m are not saved.');
            }
          } catch (e) {
            Alert.alert('Could not save run', String(e));
          } finally {
            setStopping(false);
          }
        },
      },
    ]);
  }, [navigation]);

  return (
    <Screen>
      <View style={styles.mapWrap}>
        <RunMap points={stats.points} live style={StyleSheet.absoluteFill} />
        {stats.gpsAccuracyM != null && isActive && (
          <View style={styles.gpsBadge}>
            <View
              style={[
                styles.gpsDot,
                {
                  backgroundColor:
                    stats.gpsAccuracyM <= 10
                      ? colors.accent
                      : stats.gpsAccuracyM <= 25
                        ? colors.warning
                        : colors.danger,
                },
              ]}
            />
            <Text style={styles.gpsText}>GPS ±{Math.round(stats.gpsAccuracyM)}m</Text>
          </View>
        )}
        {stats.state === 'autoPaused' && (
          <View style={styles.autoPauseBanner}>
            <Text style={styles.autoPauseText}>Auto-paused — resumes when you move</Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.heroRow}>
          <View style={styles.heroBlock}>
            <Text style={typography.label}>Time</Text>
            <Text style={styles.heroValue}>{formatDuration(stats.movingMs)}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroBlock}>
            <Text style={typography.label}>Distance {distanceUnitLabel(unit)}</Text>
            <Text style={[styles.heroValue, { color: colors.accent }]}>
              {formatDistance(stats.distanceM, unit)}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <StatTile
            label={`Pace ${paceUnitLabel(unit)}`}
            value={formatPace(stats.currentPaceSecPerKm, unit)}
          />
          <StatTile
            label={`Avg ${paceUnitLabel(unit)}`}
            value={formatPace(stats.avgPaceSecPerKm, unit)}
          />
          <StatTile
            label={`Climb ${elevationUnitLabel(unit)}`}
            value={formatElevation(stats.elevationGainM, unit)}
          />
        </View>
        <View style={styles.grid}>
          <StatTile
            label={`Speed ${speedUnitLabel(unit)}`}
            value={formatSpeed(stats.currentSpeedMs, unit)}
          />
          <StatTile
            label={`Avg ${speedUnitLabel(unit)}`}
            value={formatSpeed(stats.avgSpeedMs, unit)}
          />
          <StatTile label="kcal" value={Math.round(stats.caloriesKcal).toString()} />
        </View>

        <View style={styles.buttons}>
          {!isActive ? (
            <PillButton
              label="Start Run"
              onPress={handleStart}
              loading={starting}
              style={styles.mainButton}
            />
          ) : (
            <>
              <Pressable
                onPress={handleDiscard}
                style={({ pressed }) => [
                  styles.roundButton,
                  { backgroundColor: colors.danger, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="trash" size={24} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  if (isPausedState) trackingEngine.resume();
                  else trackingEngine.pause();
                }}
                style={({ pressed }) => [
                  styles.roundButton,
                  styles.roundButtonGhost,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name={isPausedState ? 'play' : 'pause'} size={24} color={colors.text} />
              </Pressable>
              <PillButton
                label="Finish"
                onPress={handleStop}
                loading={stopping}
                style={styles.mainButton}
              />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    flex: 1,
    margin: spacing.m,
    marginBottom: 0,
    borderRadius: radius.m,
    overflow: 'hidden',
  },
  gpsBadge: {
    position: 'absolute',
    top: spacing.s,
    left: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10, 12, 16, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.text,
  },
  autoPauseBanner: {
    position: 'absolute',
    bottom: spacing.s,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 176, 32, 0.92)',
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  autoPauseText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bg,
  },
  panel: {
    padding: spacing.m,
    gap: spacing.l,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.s,
  },
  heroBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 48,
    backgroundColor: colors.border,
  },
  heroValue: {
    ...typography.hero,
    fontSize: 52,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.s,
  },
  mainButton: {
    flex: 1,
  },
  roundButton: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonGhost: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
