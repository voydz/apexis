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
      best_10k_s REAL
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
  return db;
}
