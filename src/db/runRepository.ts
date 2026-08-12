import type { Run, RunWithPoints, TrackPoint } from '../types';
import { getDb } from './database';

interface RunRow {
  id: string;
  title: string;
  started_at: number;
  ended_at: number;
  elapsed_ms: number;
  moving_ms: number;
  distance_m: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  calories_kcal: number | null;
  steps: number | null;
  avg_cadence_spm: number | null;
  max_speed_ms: number | null;
  best_1k_s: number | null;
  best_5k_s: number | null;
  best_10k_s: number | null;
  health_workout_uuid: string | null;
  source_name: string | null;
}

function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    title: r.title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    elapsedMs: r.elapsed_ms,
    movingMs: r.moving_ms,
    distanceM: r.distance_m,
    elevationGainM: r.elevation_gain_m,
    elevationLossM: r.elevation_loss_m,
    caloriesKcal: r.calories_kcal,
    steps: r.steps,
    avgCadenceSpm: r.avg_cadence_spm,
    maxSpeedMs: r.max_speed_ms,
    best1kS: r.best_1k_s,
    best5kS: r.best_5k_s,
    best10kS: r.best_10k_s,
    healthWorkoutUuid: r.health_workout_uuid,
    sourceName: r.source_name,
  };
}

export async function saveRun(run: Run, points: TrackPoint[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO runs (
        id, title, started_at, ended_at, elapsed_ms, moving_ms, distance_m,
        elevation_gain_m, elevation_loss_m, calories_kcal, steps,
        avg_cadence_spm, max_speed_ms, best_1k_s, best_5k_s, best_10k_s,
        health_workout_uuid, source_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      run.id,
      run.title,
      run.startedAt,
      run.endedAt,
      run.elapsedMs,
      run.movingMs,
      run.distanceM,
      run.elevationGainM,
      run.elevationLossM,
      run.caloriesKcal,
      run.steps,
      run.avgCadenceSpm,
      run.maxSpeedMs,
      run.best1kS,
      run.best5kS,
      run.best10kS,
      run.healthWorkoutUuid ?? null,
      run.sourceName ?? null
    );
    // Chunked insert to stay well below SQLite's variable limit
    const CHUNK = 100;
    for (let i = 0; i < points.length; i += CHUNK) {
      const chunk = points.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values: (string | number | null)[] = [];
      chunk.forEach((p, j) => {
        values.push(
          run.id,
          i + j,
          p.timestamp,
          p.latitude,
          p.longitude,
          p.altitude,
          p.speed,
          p.accuracy,
          p.segment
        );
      });
      await db.runAsync(
        `INSERT INTO track_points (run_id, seq, timestamp, latitude, longitude, altitude, speed, accuracy, segment)
         VALUES ${placeholders}`,
        ...values
      );
    }
  });
}

export async function listRuns(): Promise<Run[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RunRow>('SELECT * FROM runs ORDER BY started_at DESC');
  return rows.map(rowToRun);
}

export async function getRunWithPoints(id: string): Promise<RunWithPoints | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<RunRow>('SELECT * FROM runs WHERE id = ?', id);
  if (!row) return null;
  const pointRows = await db.getAllAsync<{
    timestamp: number;
    latitude: number;
    longitude: number;
    altitude: number | null;
    speed: number | null;
    accuracy: number | null;
    segment: number;
  }>(
    'SELECT timestamp, latitude, longitude, altitude, speed, accuracy, segment FROM track_points WHERE run_id = ? ORDER BY seq',
    id
  );
  return { ...rowToRun(row), points: pointRows };
}

/** Downsampled trace (~maxPoints) for list thumbnails, cheap to load. */
export async function getRoutePreviewPoints(
  runId: string,
  maxPoints = 150
): Promise<TrackPoint[]> {
  const db = await getDb();
  const countRow = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM track_points WHERE run_id = ?',
    runId
  );
  const n = countRow?.n ?? 0;
  if (n === 0) return [];
  const k = Math.max(1, Math.ceil(n / maxPoints));
  return db.getAllAsync<TrackPoint>(
    `SELECT timestamp, latitude, longitude, altitude, speed, accuracy, segment
     FROM track_points WHERE run_id = ? AND (seq % ? = 0 OR seq = ?) ORDER BY seq`,
    runId,
    k,
    n - 1
  );
}

export async function deleteRun(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM runs WHERE id = ?', id);
}

export async function updateRunTitle(id: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE runs SET title = ? WHERE id = ?', title, id);
}

export async function markRunSyncedToHealth(id: string, healthUuid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE runs SET health_workout_uuid = ? WHERE id = ?', healthUuid, id);
}

/** Health-store ids of all runs already linked (exported or imported). */
export async function getLinkedHealthUuids(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ health_workout_uuid: string }>(
    'SELECT health_workout_uuid FROM runs WHERE health_workout_uuid IS NOT NULL'
  );
  return new Set(rows.map((r) => r.health_workout_uuid));
}
