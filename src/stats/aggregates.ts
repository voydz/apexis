import type { Run } from '../types';

export type Period = 'week' | 'month' | 'year' | 'all';

export interface Totals {
  runs: number;
  distanceM: number;
  movingMs: number;
  elevationGainM: number;
  caloriesKcal: number;
  avgPaceSecPerKm: number | null;
}

export interface TrendBucket {
  label: string;
  /** bucket start (unix ms), for ordering */
  start: number;
  distanceM: number;
  runs: number;
}

export interface Records {
  longestRun: Run | null;
  biggestClimb: Run | null;
  bestAvgPace: Run | null;
  mostSteps: Run | null;
}

export interface EffortEntry {
  run: Run;
  seconds: number;
}

/** Fastest runs over the given best-effort window, best first. */
export function topEfforts(
  runs: Run[],
  key: 'best1kS' | 'best5kS' | 'best10kS',
  limit = 5
): EffortEntry[] {
  return runs
    .flatMap((run) => (run[key] != null ? [{ run, seconds: run[key] as number }] : []))
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, limit);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Monday-based start of week. */
function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
}

export function periodStart(period: Period, now = new Date()): number {
  switch (period) {
    case 'week':
      return startOfWeek(now).getTime();
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'year':
      return new Date(now.getFullYear(), 0, 1).getTime();
    case 'all':
      return 0;
  }
}

export function filterByPeriod(runs: Run[], period: Period): Run[] {
  const start = periodStart(period);
  return runs.filter((r) => r.startedAt >= start);
}

export function computeTotals(runs: Run[]): Totals {
  const distanceM = runs.reduce((s, r) => s + r.distanceM, 0);
  const movingMs = runs.reduce((s, r) => s + r.movingMs, 0);
  return {
    runs: runs.length,
    distanceM,
    movingMs,
    elevationGainM: runs.reduce((s, r) => s + r.elevationGainM, 0),
    caloriesKcal: runs.reduce((s, r) => s + (r.caloriesKcal ?? 0), 0),
    avgPaceSecPerKm: distanceM > 100 ? movingMs / 1000 / (distanceM / 1000) : null,
  };
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * Distance trend buckets for a period:
 * week → 7 days, month → days of month grouped by week, year/all → 12 months.
 */
export function computeTrend(runs: Run[], period: Period, now = new Date()): TrendBucket[] {
  if (period === 'week') {
    const weekStart = startOfWeek(now).getTime();
    const buckets: TrendBucket[] = DAY_LABELS.map((label, i) => ({
      label,
      start: weekStart + i * 86400_000,
      distanceM: 0,
      runs: 0,
    }));
    for (const r of runs) {
      const idx = Math.floor((r.startedAt - weekStart) / 86400_000);
      if (idx >= 0 && idx < 7) {
        buckets[idx].distanceM += r.distanceM;
        buckets[idx].runs += 1;
      }
    }
    return buckets;
  }

  if (period === 'month') {
    // All calendar weeks intersecting the current month (future weeks
    // included, like the week view shows all 7 days), labeled by Monday.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const weeks: TrendBucket[] = [];
    const cursor = startOfWeek(monthStart);
    while (cursor.getTime() < monthEnd.getTime()) {
      weeks.push({
        label: cursor.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        start: cursor.getTime(),
        distanceM: 0,
        runs: 0,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    assignToBuckets(runs, weeks);
    return weeks;
  }

  const buckets: TrendBucket[] = [];
  if (period === 'year') {
    // All 12 months of the current year
    for (let m = 0; m < 12; m++) {
      buckets.push({
        label: MONTH_LABELS[m],
        start: new Date(now.getFullYear(), m, 1).getTime(),
        distanceM: 0,
        runs: 0,
      });
    }
  } else {
    // all → last 12 calendar months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: MONTH_LABELS[d.getMonth()],
        start: d.getTime(),
        distanceM: 0,
        runs: 0,
      });
    }
  }
  assignToBuckets(runs, buckets);
  return buckets;
}

/** Adds each run to the last bucket whose start precedes it. */
function assignToBuckets(runs: Run[], buckets: TrendBucket[]): void {
  for (const r of runs) {
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (r.startedAt >= buckets[i].start) {
        buckets[i].distanceM += r.distanceM;
        buckets[i].runs += 1;
        break;
      }
    }
  }
}

export function computeRecords(runs: Run[]): Records {
  let longestRun: Run | null = null;
  let biggestClimb: Run | null = null;
  let bestAvgPace: Run | null = null;
  let mostSteps: Run | null = null;

  for (const r of runs) {
    if (!longestRun || r.distanceM > longestRun.distanceM) longestRun = r;
    if (!biggestClimb || r.elevationGainM > biggestClimb.elevationGainM) biggestClimb = r;
    if (r.steps != null && (!mostSteps || r.steps > (mostSteps.steps ?? 0))) mostSteps = r;
    // Only rank avg pace for runs of at least 1km to avoid noise
    if (r.distanceM >= 1000 && r.movingMs > 0) {
      const pace = r.movingMs / 1000 / (r.distanceM / 1000);
      const bestPace = bestAvgPace
        ? bestAvgPace.movingMs / 1000 / (bestAvgPace.distanceM / 1000)
        : Infinity;
      if (pace < bestPace) bestAvgPace = r;
    }
  }

  return { longestRun, biggestClimb, bestAvgPace, mostSteps };
}
