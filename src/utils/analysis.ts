import type { Split, TrackPoint } from '../types';
import { haversineM } from './geo';

interface CumulativePoint {
  /** cumulative moving distance in meters */
  d: number;
  /** cumulative moving time in seconds */
  t: number;
  altitude: number | null;
}

/**
 * Builds cumulative distance/moving-time arrays from raw points.
 * Time gaps across segment boundaries (pauses) are excluded.
 */
export function buildCumulative(points: TrackPoint[]): CumulativePoint[] {
  const out: CumulativePoint[] = [];
  let d = 0;
  let t = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      if (prev.segment === p.segment) {
        d += haversineM(prev.latitude, prev.longitude, p.latitude, p.longitude);
        t += (p.timestamp - prev.timestamp) / 1000;
      }
    }
    out.push({ d, t, altitude: p.altitude });
  }
  return out;
}

/** Splits of `splitLengthM` meters (e.g. 1000 or 1609.344). Last split may be partial. */
export function computeSplits(points: TrackPoint[], splitLengthM: number): Split[] {
  const cum = buildCumulative(points);
  if (cum.length < 2) return [];

  const splits: Split[] = [];
  let splitStartIdx = 0;
  let nextBoundary = splitLengthM;

  const makeSplit = (startIdx: number, endIdx: number, index: number): Split | null => {
    const dist = cum[endIdx].d - cum[startIdx].d;
    const dur = cum[endIdx].t - cum[startIdx].t;
    if (dist < 1 || dur <= 0) return null;
    const startAlt = firstAltitude(points, startIdx, endIdx);
    const endAlt = lastAltitude(points, startIdx, endIdx);
    return {
      index,
      distanceM: dist,
      durationS: dur,
      paceSecPerKm: (dur / dist) * 1000,
      elevationChangeM: startAlt != null && endAlt != null ? endAlt - startAlt : 0,
    };
  };

  for (let i = 1; i < cum.length; i++) {
    while (cum[i].d >= nextBoundary) {
      const split = makeSplit(splitStartIdx, i, splits.length + 1);
      if (split) splits.push(split);
      splitStartIdx = i;
      nextBoundary += splitLengthM;
    }
  }
  // Trailing partial split
  const last = cum.length - 1;
  if (cum[last].d - cum[splitStartIdx].d > 25) {
    const split = makeSplit(splitStartIdx, last, splits.length + 1);
    if (split) splits.push(split);
  }
  return splits;
}

function firstAltitude(points: TrackPoint[], from: number, to: number): number | null {
  for (let i = from; i <= to; i++) if (points[i].altitude != null) return points[i].altitude;
  return null;
}

function lastAltitude(points: TrackPoint[], from: number, to: number): number | null {
  for (let i = to; i >= from; i--) if (points[i].altitude != null) return points[i].altitude;
  return null;
}

/**
 * Fastest moving time (seconds) over any contiguous window of `windowM` meters.
 * Returns null if the run is shorter than the window.
 */
export function bestWindowTimeS(points: TrackPoint[], windowM: number): number | null {
  const cum = buildCumulative(points);
  if (cum.length < 2 || cum[cum.length - 1].d < windowM) return null;

  let best = Infinity;
  let lo = 0;
  for (let hi = 1; hi < cum.length; hi++) {
    while (lo + 1 < hi && cum[hi].d - cum[lo + 1].d >= windowM) lo++;
    if (cum[hi].d - cum[lo].d >= windowM) {
      const time = cum[hi].t - cum[lo].t;
      // Scale down to exactly windowM assuming constant pace in the window
      const scaled = time * (windowM / (cum[hi].d - cum[lo].d));
      if (scaled < best) best = scaled;
    }
  }
  return isFinite(best) ? best : null;
}

/**
 * Downsampled series of {x: distance m, y: pace sec/km} for charting.
 * Uses a rolling window to smooth GPS noise.
 */
export function paceSeries(points: TrackPoint[], buckets = 80): { x: number; y: number }[] {
  const cum = buildCumulative(points);
  if (cum.length < 3) return [];
  const total = cum[cum.length - 1].d;
  if (total < 100) return [];
  const step = total / buckets;
  const out: { x: number; y: number }[] = [];
  let idx = 0;
  for (let b = 1; b <= buckets; b++) {
    const target = b * step;
    while (idx < cum.length - 1 && cum[idx].d < target) idx++;
    const winStart = Math.max(0, target - Math.max(step, 100));
    let lo = idx;
    while (lo > 0 && cum[lo].d > winStart) lo--;
    const dd = cum[idx].d - cum[lo].d;
    const dt = cum[idx].t - cum[lo].t;
    if (dd > 5 && dt > 0) {
      const pace = (dt / dd) * 1000;
      if (pace < 1800) out.push({ x: target, y: pace });
    }
  }
  return out;
}

/** Downsampled series of {x: distance m, y: altitude m} with light smoothing. */
export function elevationSeries(points: TrackPoint[], buckets = 80): { x: number; y: number }[] {
  const cum = buildCumulative(points);
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i < cum.length; i++) {
    if (cum[i].altitude != null) raw.push({ x: cum[i].d, y: cum[i].altitude! });
  }
  if (raw.length < 3) return [];
  // EMA smoothing
  const smoothed: { x: number; y: number }[] = [];
  let ema = raw[0].y;
  for (const p of raw) {
    ema = ema + 0.18 * (p.y - ema);
    smoothed.push({ x: p.x, y: ema });
  }
  if (smoothed.length <= buckets) return smoothed;
  const step = Math.ceil(smoothed.length / buckets);
  return smoothed.filter((_, i) => i % step === 0 || i === smoothed.length - 1);
}

/** MET-free simple estimate: ~1.036 kcal per kg per km for running. */
export function estimateCaloriesKcal(distanceM: number, weightKg: number): number {
  return (distanceM / 1000) * weightKg * 1.036;
}
