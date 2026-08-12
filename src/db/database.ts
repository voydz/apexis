import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('apexis.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      moving_ms INTEGER NOT NULL,
      distance_m REAL NOT NULL,
      elevation_gain_m REAL NOT NULL DEFAULT 0,
      elevation_loss_m REAL NOT NULL DEFAULT 0,
      calories_kcal REAL,
      steps INTEGER,
      avg_cadence_spm REAL,
      max_speed_ms REAL,
      best_1k_s REAL,
      best_5k_s REAL,
      best_10k_s REAL,
      health_workout_uuid TEXT,
      source_name TEXT
    );

    CREATE TABLE IF NOT EXISTS track_points (
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      speed REAL,
      accuracy REAL,
      segment INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
  `);
  // Migrations for databases created before these columns existed
  const runCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(runs)');
  if (!runCols.some((c) => c.name === 'health_workout_uuid')) {
    await db.execAsync('ALTER TABLE runs ADD COLUMN health_workout_uuid TEXT');
  }
  if (!runCols.some((c) => c.name === 'source_name')) {
    await db.execAsync('ALTER TABLE runs ADD COLUMN source_name TEXT');
  }
  // Implausibly fast best efforts (faster than 12.5 m/s) were computed from
  // imported routes with broken per-point timestamps; treat them as unknown
  // so they don't win personal records.
  await db.execAsync(`
    UPDATE runs SET
      best_1k_s = CASE WHEN best_1k_s < 80 THEN NULL ELSE best_1k_s END,
      best_5k_s = CASE WHEN best_5k_s < 400 THEN NULL ELSE best_5k_s END,
      best_10k_s = CASE WHEN best_10k_s < 800 THEN NULL ELSE best_10k_s END
    WHERE best_1k_s < 80 OR best_5k_s < 400 OR best_10k_s < 800;
  `);
  return db;
}
