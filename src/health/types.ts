import type { Run, TrackPoint } from '../types';

/** Lightweight listing entry for a workout living in the platform health store. */
export interface HealthWorkoutSummary {
  /** Platform record id (HKWorkout uuid / Health Connect record id). */
  id: string;
  /** Unix ms */
  startedAt: number;
  /** Unix ms */
  endedAt: number;
  /** Time excluding pauses where the store provides it, otherwise elapsed. */
  durationMs: number;
  /** null when the store has no distance for this workout */
  distanceM: number | null;
  caloriesKcal: number | null;
  /** Name of the app that recorded the workout (e.g. "Strava"). */
  sourceName: string;
}

/** Full workout details fetched for import. */
export interface HealthWorkoutData {
  summary: HealthWorkoutSummary;
  /** GPS route mapped to track points; empty when no route is available. */
  points: TrackPoint[];
}

export interface HealthBackend {
  /** Whether the health store exists on this device (Health Connect may be missing). */
  isAvailable(): Promise<boolean>;
  /**
   * Ask the OS for all read/write permissions this feature needs.
   * Resolves true when the flow completed; actual grants may still be partial
   * (HealthKit intentionally hides read grants).
   */
  requestPermissions(): Promise<boolean>;
  /** Export a finished run as a workout. Returns the new health-store record id. */
  saveRun(run: Run, points: TrackPoint[]): Promise<string | null>;
  /** Most recent body weight in the store, in kilograms. */
  readLatestBodyWeightKg(): Promise<number | null>;
  /** Running workouts recorded by other apps, newest first. */
  listWorkouts(): Promise<HealthWorkoutSummary[]>;
  /**
   * Fetch full details incl. route for one workout.
   * `allowConsentPrompt` permits Health Connect's per-route consent dialog
   * (only acceptable for a user-initiated single import).
   */
  readWorkout(id: string, allowConsentPrompt: boolean): Promise<HealthWorkoutData | null>;
  /**
   * Workouts added to the store since `anchor` (HKQueryAnchor / HC changes token).
   * With a null anchor no workouts are returned — just a fresh anchor at "now".
   */
  getNewWorkoutsSinceAnchor(
    anchor: string | null
  ): Promise<{ summaries: HealthWorkoutSummary[]; newAnchor: string | null }>;
}
