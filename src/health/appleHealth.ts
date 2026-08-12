import {
  currentAppSource,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryWorkoutSamples,
  queryWorkoutSamplesWithAnchor,
  requestAuthorization,
  saveWorkoutSample,
  WorkoutActivityType,
  type LocationForSaving,
  type Quantity,
} from '@kingstinct/react-native-healthkit';
import type { Run, TrackPoint } from '../types';
import { METERS_PER_MILE } from '../utils/format';
import type { HealthBackend, HealthWorkoutData, HealthWorkoutSummary } from './types';

// The WorkoutProxy hybrid-object type is not re-exported from the package root.
type WorkoutProxy = Awaited<ReturnType<typeof queryWorkoutSamples>>[number];

const WRITE_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKWorkoutRouteTypeIdentifier',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;

const READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKWorkoutRouteTypeIdentifier',
  'HKQuantityTypeIdentifierBodyMass',
] as const;

// The native layer emits a mix of HKUnit strings ("m", "kcal", "s") and
// long-form names (workout totalDistance comes back as "meters").
function quantityToMeters(q: Quantity | undefined): number | null {
  if (!q) return null;
  switch (q.unit) {
    case 'm':
    case 'meters':
      return q.quantity;
    case 'km':
    case 'kilometers':
      return q.quantity * 1000;
    case 'mi':
    case 'miles':
      return q.quantity * METERS_PER_MILE;
    case 'yd':
    case 'yards':
      return q.quantity * 0.9144;
    case 'ft':
    case 'feet':
      return q.quantity * 0.3048;
    default:
      return null;
  }
}

function quantityToKcal(q: Quantity | undefined): number | null {
  if (!q) return null;
  switch (q.unit) {
    // HealthKit's large calorie (dietary Calorie) equals a kilocalorie
    case 'kcal':
    case 'kilocalories':
    case 'Cal':
      return q.quantity;
    case 'cal':
      return q.quantity / 1000;
    case 'kJ':
    case 'kilojoules':
      return q.quantity / 4.184;
    case 'J':
    case 'joules':
      return q.quantity / 4184;
    default:
      return null;
  }
}

function quantityToMs(q: Quantity | undefined): number | null {
  if (!q) return null;
  switch (q.unit) {
    case 's':
    case 'seconds':
      return q.quantity * 1000;
    case 'min':
    case 'minutes':
      return q.quantity * 60_000;
    case 'hr':
    case 'hours':
      return q.quantity * 3_600_000;
    default:
      return null;
  }
}

function ownBundleId(): string | null {
  try {
    return currentAppSource().bundleIdentifier;
  } catch {
    return null;
  }
}

/**
 * `source.name` is shadowed by Nitro's HybridObject.name (always "SourceProxy");
 * toJSON() returns the actual HKSource values.
 */
function sourceNameOf(w: WorkoutProxy): string {
  try {
    const source = w.sourceRevision.source;
    const json = source.toJSON();
    if (json.name && json.name !== 'SourceProxy') return json.name;
    return source.bundleIdentifier;
  } catch {
    return 'Apple Health';
  }
}

function toSummary(w: WorkoutProxy): HealthWorkoutSummary {
  const startedAt = w.startDate.getTime();
  const endedAt = w.endDate.getTime();
  return {
    id: w.uuid,
    startedAt,
    endedAt,
    durationMs: quantityToMs(w.duration) ?? Math.max(0, endedAt - startedAt),
    distanceM: quantityToMeters(w.totalDistance),
    caloriesKcal: quantityToKcal(w.totalEnergyBurned),
    sourceName: sourceNameOf(w),
  };
}

function isImportCandidate(w: WorkoutProxy, own: string | null): boolean {
  if (w.workoutActivityType !== WorkoutActivityType.running) return false;
  return own == null || w.sourceRevision.source.bundleIdentifier !== own;
}

/**
 * Since iOS 16 apps may store distance/energy only as workout statistics,
 * leaving the legacy totalDistance/totalEnergyBurned fields empty.
 */
async function fillTotalsFromStatistics(
  w: WorkoutProxy,
  summary: HealthWorkoutSummary
): Promise<HealthWorkoutSummary> {
  let { distanceM, caloriesKcal } = summary;
  if (distanceM == null) {
    const stat = await w
      .getStatistic('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm')
      .catch(() => undefined);
    distanceM = quantityToMeters(stat?.sumQuantity) ?? null;
  }
  if (caloriesKcal == null) {
    const stat = await w
      .getStatistic('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal')
      .catch(() => undefined);
    caloriesKcal = quantityToKcal(stat?.sumQuantity) ?? null;
  }
  return { ...summary, distanceM, caloriesKcal };
}

async function routePoints(w: WorkoutProxy): Promise<TrackPoint[]> {
  const routes = await w.getWorkoutRoutes();
  const points: TrackPoint[] = [];
  routes.forEach((route: (typeof routes)[number], segment: number) => {
    for (const loc of route.locations) {
      points.push({
        timestamp: loc.date.getTime(),
        latitude: loc.latitude,
        longitude: loc.longitude,
        altitude: loc.verticalAccuracy >= 0 ? loc.altitude : null,
        speed: loc.speed >= 0 ? loc.speed : null,
        accuracy: loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : null,
        segment,
      });
    }
  });
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

export const appleHealth: HealthBackend = {
  async isAvailable() {
    return isHealthDataAvailable();
  },

  async requestPermissions() {
    return requestAuthorization({ toShare: [...WRITE_TYPES], toRead: [...READ_TYPES] });
  },

  async saveRun(run: Run, points: TrackPoint[]) {
    const start = new Date(run.startedAt);
    const end = new Date(run.endedAt);
    const workout = await saveWorkoutSample(
      WorkoutActivityType.running,
      [],
      start,
      end,
      {
        distance: run.distanceM,
        energyBurned: run.caloriesKcal ?? undefined,
      },
      { HKMetadataKeyIndoorWorkout: false }
    );
    if (!workout) return null;

    const locations: LocationForSaving[] = points
      .filter((p) => p.timestamp >= run.startedAt && p.timestamp <= run.endedAt)
      .map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        // CoreLocation treats negative accuracies as "unknown"
        altitude: p.altitude ?? 0,
        verticalAccuracy: p.altitude != null ? 10 : -1,
        horizontalAccuracy: p.accuracy ?? 10,
        speed: p.speed ?? -1,
        course: -1,
        date: new Date(p.timestamp),
      }));
    if (locations.length >= 2) {
      // Route is an enhancement; the workout itself is already saved.
      await workout.saveWorkoutRoute(locations).catch(() => {});
    }
    return workout.uuid;
  },

  async readLatestBodyWeightKg() {
    const sample = await getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg');
    return sample?.quantity ?? null;
  },

  async listWorkouts() {
    const own = ownBundleId();
    const workouts = await queryWorkoutSamples({
      filter: { workoutActivityType: WorkoutActivityType.running },
      limit: -1,
      ascending: false,
    });
    const candidates = workouts.filter((w) => isImportCandidate(w, own));
    return Promise.all(candidates.map((w) => fillTotalsFromStatistics(w, toSummary(w))));
  },

  async readWorkout(id: string) {
    const matches = await queryWorkoutSamples({ filter: { uuid: id }, limit: 1 });
    const workout = matches[0];
    if (!workout) return null;
    const data: HealthWorkoutData = {
      summary: await fillTotalsFromStatistics(workout, toSummary(workout)),
      points: await routePoints(workout).catch((e) => {
        console.warn('[health] failed to read workout route', e);
        return [];
      }),
    };
    return data;
  },

  async getNewWorkoutsSinceAnchor(anchor: string | null) {
    const response = await queryWorkoutSamplesWithAnchor({
      filter: { workoutActivityType: WorkoutActivityType.running },
      limit: -1,
      ...(anchor ? { anchor } : {}),
    });
    // First call (no anchor) only establishes the anchor; history is handled
    // by the manual import screen.
    if (!anchor) {
      return { summaries: [], newAnchor: response.newAnchor || null };
    }
    const own = ownBundleId();
    return {
      summaries: response.workouts.filter((w) => isImportCandidate(w, own)).map(toSummary),
      newAnchor: response.newAnchor || null,
    };
  },
};
