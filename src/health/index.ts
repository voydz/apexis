import { Platform } from 'react-native';
import type { Run, TrackPoint } from '../types';
import { appleHealth } from './appleHealth';
import { healthConnect } from './healthConnect';
import type { HealthBackend, HealthWorkoutData, HealthWorkoutSummary } from './types';

export type { HealthWorkoutData, HealthWorkoutSummary } from './types';

// Both backend modules are safe to import on any platform: the underlying
// libraries only touch native code when their functions are called.
const backend: HealthBackend | null =
  Platform.OS === 'ios' ? appleHealth : Platform.OS === 'android' ? healthConnect : null;

export function isHealthSyncSupported(): boolean {
  return backend != null;
}

export function healthStoreLabel(): string {
  return Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';
}

export async function isHealthStoreAvailable(): Promise<boolean> {
  if (!backend) return false;
  return backend.isAvailable().catch(() => false);
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (!backend) return false;
  return backend.requestPermissions().catch(() => false);
}

/** Export a run to the health store. Returns the health-store record id. */
export async function saveRunToHealth(run: Run, points: TrackPoint[]): Promise<string | null> {
  if (!backend) return null;
  return backend.saveRun(run, points);
}

export async function readLatestBodyWeightKg(): Promise<number | null> {
  if (!backend) return null;
  return backend.readLatestBodyWeightKg().catch(() => null);
}

/** Running workouts from other apps, newest first. */
export async function listHealthWorkouts(): Promise<HealthWorkoutSummary[]> {
  if (!backend) return [];
  return backend.listWorkouts();
}

export async function readHealthWorkout(
  id: string,
  allowConsentPrompt: boolean
): Promise<HealthWorkoutData | null> {
  if (!backend) return null;
  return backend.readWorkout(id, allowConsentPrompt);
}

export async function getNewHealthWorkoutsSinceAnchor(
  anchor: string | null
): Promise<{ summaries: HealthWorkoutSummary[]; newAnchor: string | null }> {
  if (!backend) return { summaries: [], newAnchor: anchor };
  return backend.getNewWorkoutsSinceAnchor(anchor);
}
