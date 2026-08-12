import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLinkedHealthUuids } from '../db/runRepository';
import { useSettings } from '../settings/SettingsContext';
import { getNewHealthWorkoutsSinceAnchor, isHealthSyncSupported, readLatestBodyWeightKg } from './index';
import { importHealthWorkout } from './importRun';

const ANCHOR_KEY = 'apexis.health.anchor.v1';
const MIN_SYNC_INTERVAL_MS = 60_000;

/**
 * Silently imports workouts that appeared in the health store since the last
 * check (on launch and whenever the app returns to the foreground), and keeps
 * the weight setting prefilled from the store until the user sets it manually.
 * Renders nothing; mount once inside SettingsProvider.
 */
export function HealthSyncProvider() {
  const { settings, update, loaded } = useSettings();
  const syncing = useRef(false);
  const lastSyncAt = useRef(0);

  const enabled = loaded && settings.syncToHealth && isHealthSyncSupported();

  // settings is intentionally read through a ref so AppState events don't
  // re-subscribe on every settings change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!enabled) return;

    const syncNow = async () => {
      if (syncing.current) return;
      if (Date.now() - lastSyncAt.current < MIN_SYNC_INTERVAL_MS) return;
      syncing.current = true;
      try {
        const anchor = await AsyncStorage.getItem(ANCHOR_KEY);
        const { summaries, newAnchor } = await getNewHealthWorkoutsSinceAnchor(anchor);
        if (summaries.length > 0) {
          const linked = await getLinkedHealthUuids();
          for (const summary of summaries) {
            if (linked.has(summary.id)) continue;
            await importHealthWorkout(summary.id, {
              weightKg: settingsRef.current.weightKg,
              allowConsentPrompt: false,
            }).catch(() => {});
          }
        }
        if (newAnchor !== anchor) {
          if (newAnchor) await AsyncStorage.setItem(ANCHOR_KEY, newAnchor);
          else await AsyncStorage.removeItem(ANCHOR_KEY);
        }
        lastSyncAt.current = Date.now();
      } catch {
        // Silent by design; the next foreground transition retries.
      } finally {
        syncing.current = false;
      }
    };

    syncNow();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });
    return () => sub.remove();
  }, [enabled]);

  // Weight prefill: keep following the health store until manually overridden.
  useEffect(() => {
    if (!enabled || settings.weightSetManually) return;
    let cancelled = false;
    readLatestBodyWeightKg().then((kg) => {
      if (cancelled || kg == null) return;
      const rounded = Math.round(Math.min(200, Math.max(30, kg)) * 2) / 2;
      if (rounded !== settingsRef.current.weightKg) update({ weightKg: rounded });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, settings.weightSetManually, update]);

  return null;
}
