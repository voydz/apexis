import { saveRun } from '../db/runRepository';
import type { Run, TrackPoint } from '../types';
import { bestWindowTimeS, buildCumulative, estimateCaloriesKcal } from '../utils/analysis';
import { runTitleForTime } from '../utils/format';
import { readHealthWorkout } from './index';
import type { HealthWorkoutData } from './types';

/** Gaps longer than this between route points are treated as pauses. */
const PAUSE_GAP_MS = 30_000;
/** Same hysteresis the live tracking engine uses for elevation. */
const ELEVATION_THRESHOLD_M = 2;
const MAX_PLAUSIBLE_SPEED = 12.5;

/** Re-segment imported points so pause gaps aren't counted as moving time. */
function segmentByGaps(points: TrackPoint[]): TrackPoint[] {
  let segment = 0;
  return points.map((p, i) => {
    if (i > 0 && p.timestamp - points[i - 1].timestamp > PAUSE_GAP_MS) segment += 1;
    return { ...p, segment };
  });
}

function computeElevation(points: TrackPoint[]): { gainM: number; lossM: number } {
  let gainM = 0;
  let lossM = 0;
  let smoothed: number | null = null;
  let ref: number | null = null;
  for (const p of points) {
    if (p.altitude == null) continue;
    if (smoothed == null) {
      smoothed = p.altitude;
      ref = p.altitude;
      continue;
    }
    smoothed += 0.12 * (p.altitude - smoothed);
    if (ref == null) ref = smoothed;
    const diff = smoothed - ref;
    if (diff > ELEVATION_THRESHOLD_M) {
      gainM += diff;
      ref = smoothed;
    } else if (diff < -ELEVATION_THRESHOLD_M) {
      lossM += -diff;
      ref = smoothed;
    }
  }
  return { gainM, lossM };
}

/**
 * Builds an Apex run from a health-store workout. Stats the store doesn't
 * carry (elevation, best efforts, max speed) are recomputed from the route.
 */
export function buildRunFromHealthWorkout(
  data: HealthWorkoutData,
  weightKg: number
): { run: Run; points: TrackPoint[] } {
  const { summary } = data;
  const points = segmentByGaps(data.points);
  const cum = buildCumulative(points);
  const pointDistanceM = cum.length > 0 ? cum[cum.length - 1].d : 0;
  const pointMovingMs = cum.length > 0 ? cum[cum.length - 1].t * 1000 : 0;

  const elapsedMs = Math.max(0, summary.endedAt - summary.startedAt);
  const distanceM = summary.distanceM ?? pointDistanceM;
  // Store duration (excludes pauses on iOS) when present, otherwise the
  // gap-segmented moving time from the route, otherwise wall-clock.
  const movingMs = Math.min(
    elapsedMs,
    summary.durationMs > 0 ? summary.durationMs : pointMovingMs > 0 ? pointMovingMs : elapsedMs
  );

  const { gainM, lossM } = computeElevation(points);
  const speeds = points
    .map((p) => p.speed)
    .filter((s): s is number => s != null && s > 0 && s <= MAX_PLAUSIBLE_SPEED);
  const caloriesKcal =
    summary.caloriesKcal ?? (distanceM > 0 ? estimateCaloriesKcal(distanceM, weightKg) : null);

  const run: Run = {
    id: `run_${summary.startedAt}_${Math.floor(Math.random() * 1e6)}`,
    title: runTitleForTime(summary.startedAt),
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    elapsedMs,
    movingMs,
    distanceM,
    elevationGainM: gainM,
    elevationLossM: lossM,
    caloriesKcal,
    steps: null,
    avgCadenceSpm: null,
    maxSpeedMs: speeds.length > 0 ? Math.max(...speeds) : null,
    best1kS: bestWindowTimeS(points, 1000),
    best5kS: bestWindowTimeS(points, 5000),
    best10kS: bestWindowTimeS(points, 10000),
    healthWorkoutUuid: summary.id,
    sourceName: summary.sourceName,
  };
  return { run, points };
}

/**
 * Imports one health-store workout into the local database.
 * Returns the new run id, or null when the workout couldn't be read.
 */
export async function importHealthWorkout(
  healthWorkoutId: string,
  options: { weightKg: number; allowConsentPrompt: boolean }
): Promise<string | null> {
  const data = await readHealthWorkout(healthWorkoutId, options.allowConsentPrompt);
  if (!data) return null;
  const { run, points } = buildRunFromHealthWorkout(data, options.weightKg);
  await saveRun(run, points);
  return run.id;
}
