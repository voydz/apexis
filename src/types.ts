export interface TrackPoint {
  /** Unix ms */
  timestamp: number;
  latitude: number;
  longitude: number;
  /** meters, null if unavailable */
  altitude: number | null;
  /** m/s, null if unavailable */
  speed: number | null;
  /** horizontal accuracy in meters */
  accuracy: number | null;
  /** Segment index; increments after every pause so gaps aren't drawn/counted. */
  segment: number;
}

export interface Split {
  /** 1-based */
  index: number;
  /** meters covered in this split (last split may be partial) */
  distanceM: number;
  /** moving seconds */
  durationS: number;
  paceSecPerKm: number;
  /** net altitude change in meters */
  elevationChangeM: number;
}

export interface Run {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number;
  /** wall-clock ms */
  elapsedMs: number;
  /** ms excluding pauses */
  movingMs: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  caloriesKcal: number | null;
  steps: number | null;
  avgCadenceSpm: number | null;
  /** m/s */
  maxSpeedMs: number | null;
  /** fastest rolling-window times in seconds */
  best1kS: number | null;
  best5kS: number | null;
  best10kS: number | null;
  /**
   * Platform health-store id: set when the run was exported to (or imported
   * from) Apple Health / Health Connect. Prevents duplicate sync in both directions.
   */
  healthWorkoutUuid?: string | null;
  /** Name of the originating app for imported runs; null for runs recorded in Apex. */
  sourceName?: string | null;
}

export type RunWithPoints = Run & { points: TrackPoint[] };

export type TrackingState = 'idle' | 'tracking' | 'paused' | 'autoPaused';

export interface LiveStats {
  state: TrackingState;
  startedAt: number | null;
  elapsedMs: number;
  movingMs: number;
  distanceM: number;
  /** sec/km over the last ~15s, null when not moving */
  currentPaceSecPerKm: number | null;
  avgPaceSecPerKm: number | null;
  /** m/s, consistent with avgPaceSecPerKm (frozen between GPS fixes) */
  avgSpeedMs: number | null;
  currentSpeedMs: number | null;
  elevationGainM: number;
  elevationLossM: number;
  altitudeM: number | null;
  steps: number;
  cadenceSpm: number | null;
  caloriesKcal: number;
  splits: Split[];
  points: TrackPoint[];
  gpsAccuracyM: number | null;
}

export type DistanceUnit = 'metric' | 'imperial';

export interface AppSettings {
  unit: DistanceUnit;
  weightKg: number;
  autoPause: boolean;
  /** Sync runs with Apple Health (iOS) / Health Connect (Android). */
  syncToHealth: boolean;
  /** True once the user adjusted weight by hand; blocks the Health weight prefill. */
  weightSetManually: boolean;
}
