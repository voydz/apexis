import {
  aggregateRecord,
  ExerciseType,
  getChanges,
  getSdkStatus,
  initialize,
  insertRecords,
  readRecord,
  readRecords,
  requestExerciseRoute,
  requestPermission,
  SdkAvailabilityStatus,
  type ExerciseSessionRecord,
  type Permission,
  type RecordResult,
} from 'react-native-health-connect';
import type { Run, TrackPoint } from '../types';
import type { HealthBackend, HealthWorkoutData, HealthWorkoutSummary } from './types';

/** Must match `expo.android.package` in app.json. */
const OWN_PACKAGE = 'com.apexis.run';

const RUNNING_TYPES: number[] = [ExerciseType.RUNNING, ExerciseType.RUNNING_TREADMILL];

const PERMISSIONS: Permission[] = [
  { accessType: 'write', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'write', recordType: 'Distance' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'write', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
];

let initialized: Promise<boolean> | null = null;

function ensureInitialized(): Promise<boolean> {
  if (!initialized) initialized = initialize().catch(() => false);
  return initialized;
}

/**
 * The TS types declare `Length` as `{value, unit}` but the native layer
 * serializes reads as `{inMeters, ...}`. Accept both.
 */
function lengthToMeters(length: unknown): number | null {
  if (length == null || typeof length !== 'object') return null;
  const l = length as { inMeters?: number; value?: number; unit?: string };
  if (typeof l.inMeters === 'number') return l.inMeters;
  if (typeof l.value === 'number') {
    switch (l.unit) {
      case 'meters':
        return l.value;
      case 'kilometers':
        return l.value * 1000;
      default:
        return null;
    }
  }
  return null;
}

type RawRouteLocation = {
  time: string;
  latitude: number;
  longitude: number;
  altitude?: unknown;
  horizontalAccuracy?: unknown;
};

function toTrackPoints(route: RawRouteLocation[]): TrackPoint[] {
  const points: TrackPoint[] = route.map((loc) => {
    const altitude = lengthToMeters(loc.altitude);
    const accuracy = lengthToMeters(loc.horizontalAccuracy);
    return {
      timestamp: Date.parse(loc.time),
      latitude: loc.latitude,
      longitude: loc.longitude,
      // 0 from the native layer means "not set"
      altitude: altitude != null && altitude !== 0 ? altitude : null,
      speed: null,
      accuracy: accuracy != null && accuracy !== 0 ? accuracy : null,
      segment: 0,
    };
  });
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

function toSummary(record: RecordResult<'ExerciseSession'>): HealthWorkoutSummary | null {
  const id = record.metadata?.id;
  if (!id) return null;
  const startedAt = Date.parse(record.startTime);
  const endedAt = Date.parse(record.endTime);
  return {
    id,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    distanceM: null,
    caloriesKcal: null,
    sourceName: record.metadata?.dataOrigin ?? 'Health Connect',
  };
}

function isImportCandidate(record: RecordResult<'ExerciseSession'>): boolean {
  return (
    RUNNING_TYPES.includes(record.exerciseType) && record.metadata?.dataOrigin !== OWN_PACKAGE
  );
}

async function aggregateDistanceM(startedAt: number, endedAt: number): Promise<number | null> {
  try {
    const result = await aggregateRecord({
      recordType: 'Distance',
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(startedAt).toISOString(),
        endTime: new Date(endedAt).toISOString(),
      },
    });
    return result.DISTANCE.inMeters > 0 ? result.DISTANCE.inMeters : null;
  } catch {
    return null;
  }
}

async function aggregateCaloriesKcal(startedAt: number, endedAt: number): Promise<number | null> {
  try {
    const result = await aggregateRecord({
      recordType: 'TotalCaloriesBurned',
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(startedAt).toISOString(),
        endTime: new Date(endedAt).toISOString(),
      },
    });
    return result.ENERGY_TOTAL.inKilocalories > 0 ? result.ENERGY_TOTAL.inKilocalories : null;
  } catch {
    return null;
  }
}

export const healthConnect: HealthBackend = {
  async isAvailable() {
    try {
      const status = await getSdkStatus();
      return status === SdkAvailabilityStatus.SDK_AVAILABLE;
    } catch {
      return false;
    }
  },

  async requestPermissions() {
    if (!(await ensureInitialized())) return false;
    const granted = await requestPermission([
      ...PERMISSIONS,
      { accessType: 'write', recordType: 'ExerciseRoute' },
      { accessType: 'read', recordType: 'ReadHealthDataHistory' },
    ]);
    return granted.some(
      (p) => p.recordType === 'ExerciseSession' && p.accessType === 'write'
    );
  },

  async saveRun(run: Run, points: TrackPoint[]) {
    if (!(await ensureInitialized())) return null;
    const startTime = new Date(run.startedAt).toISOString();
    const endTime = new Date(run.endedAt).toISOString();

    const session: ExerciseSessionRecord = {
      recordType: 'ExerciseSession',
      exerciseType: ExerciseType.RUNNING,
      title: run.title,
      startTime,
      endTime,
      metadata: { clientRecordId: run.id },
    };
    const routeLocations = points
      .filter((p) => p.timestamp >= run.startedAt && p.timestamp <= run.endedAt)
      .map((p) => ({
        time: new Date(p.timestamp).toISOString(),
        latitude: p.latitude,
        longitude: p.longitude,
        ...(p.altitude != null ? { altitude: { value: p.altitude, unit: 'meters' as const } } : {}),
        ...(p.accuracy != null
          ? { horizontalAccuracy: { value: p.accuracy, unit: 'meters' as const } }
          : {}),
      }));

    let sessionId: string | null = null;
    if (routeLocations.length >= 2) {
      // Route write needs the extra WRITE_EXERCISE_ROUTE grant; fall back to
      // a route-less session when it fails.
      try {
        const ids = await insertRecords([{ ...session, exerciseRoute: { route: routeLocations } }]);
        sessionId = ids[0] ?? null;
      } catch {}
    }
    if (!sessionId) {
      const ids = await insertRecords([session]);
      sessionId = ids[0] ?? null;
    }
    if (!sessionId) return null;

    await insertRecords([
      {
        recordType: 'Distance',
        startTime,
        endTime,
        distance: { value: run.distanceM, unit: 'meters' },
      },
    ]).catch(() => {});
    if (run.caloriesKcal != null) {
      await insertRecords([
        {
          recordType: 'TotalCaloriesBurned',
          startTime,
          endTime,
          energy: { value: run.caloriesKcal, unit: 'kilocalories' },
        },
      ]).catch(() => {});
    }
    return sessionId;
  },

  async readLatestBodyWeightKg() {
    if (!(await ensureInitialized())) return null;
    const result = await readRecords('Weight', {
      timeRangeFilter: { operator: 'before', endTime: new Date().toISOString() },
      ascendingOrder: false,
      pageSize: 1,
    });
    const record = result.records[0];
    return record ? record.weight.inKilograms : null;
  },

  async listWorkouts() {
    if (!(await ensureInitialized())) return [];
    const summaries: HealthWorkoutSummary[] = [];
    let pageToken: string | undefined;
    do {
      const result = await readRecords('ExerciseSession', {
        timeRangeFilter: { operator: 'before', endTime: new Date().toISOString() },
        ascendingOrder: false,
        pageSize: 500,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const record of result.records) {
        if (!isImportCandidate(record)) continue;
        const summary = toSummary(record);
        if (summary) summaries.push(summary);
      }
      pageToken = result.pageToken || undefined;
    } while (pageToken);
    return summaries;
  },

  async readWorkout(id: string, allowConsentPrompt: boolean) {
    if (!(await ensureInitialized())) return null;
    const record = await readRecord('ExerciseSession', id);
    const summary = toSummary(record);
    if (!summary) return null;

    let points: TrackPoint[] = [];
    const routeResult = record.exerciseRoute;
    // The native layer serializes the result type as a string ("DATA",
    // "NO_DATA", "CONSENT_REQUIRED"), not the numeric enum the TS types claim.
    const routeType = routeResult ? String(routeResult.type) : null;
    if (routeResult && routeType === 'DATA' && routeResult.route.length > 0) {
      points = toTrackPoints(routeResult.route as RawRouteLocation[]);
    } else if (routeType === 'CONSENT_REQUIRED' && allowConsentPrompt) {
      // Shows a Health Connect consent dialog for this single route.
      const route = await requestExerciseRoute(id).catch(() => null);
      if (route && route.length > 0) points = toTrackPoints(route as RawRouteLocation[]);
    }

    // Distance/calories live in separate records associated only by time range.
    const [distanceM, caloriesKcal] = await Promise.all([
      aggregateDistanceM(summary.startedAt, summary.endedAt),
      aggregateCaloriesKcal(summary.startedAt, summary.endedAt),
    ]);
    const data: HealthWorkoutData = {
      summary: { ...summary, distanceM, caloriesKcal },
      points,
    };
    return data;
  },

  async getNewWorkoutsSinceAnchor(anchor: string | null) {
    if (!(await ensureInitialized())) return { summaries: [], newAnchor: anchor };
    const summaries: HealthWorkoutSummary[] = [];
    let token: string | null = anchor;
    let newAnchor: string | null = anchor;
    let hasMore = true;

    while (hasMore) {
      // Without a token this fetches a fresh one with an empty changeset,
      // which is exactly how the anchor gets initialized.
      const changes = await getChanges({
        recordTypes: ['ExerciseSession'],
        ...(token ? { changesToken: token } : {}),
      });
      if (changes.changesTokenExpired) {
        // Token too old: re-init; missed workouts stay available via manual import.
        return { summaries: [], newAnchor: null };
      }
      for (const change of changes.upsertionChanges) {
        const record = change.record;
        if (record.recordType !== 'ExerciseSession') continue;
        const sessionRecord = record as RecordResult<'ExerciseSession'>;
        if (!isImportCandidate(sessionRecord)) continue;
        const summary = toSummary(sessionRecord);
        if (summary) summaries.push(summary);
      }
      newAnchor = changes.nextChangesToken || newAnchor;
      token = changes.nextChangesToken;
      hasMore = changes.hasMore;
    }
    return { summaries, newAnchor };
  },
};
