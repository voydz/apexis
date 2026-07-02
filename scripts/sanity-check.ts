/**
 * Synthetic-data sanity check for the statistics math.
 * Run with: npx tsx scripts/sanity-check.ts
 */
import { computeSplits, bestWindowTimeS, buildCumulative } from '../src/utils/analysis';
import { haversineM } from '../src/utils/geo';
import type { TrackPoint } from '../src/types';

const METERS_PER_DEG_LAT = 111_320;

/** Straight-line run north at `speed` m/s, one fix per second. */
function syntheticRun(durationS: number, speed: number, segment = 0, startLat = 47.0): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let t = 0; t <= durationS; t++) {
    points.push({
      timestamp: 1_700_000_000_000 + t * 1000,
      latitude: startLat + (speed * t) / METERS_PER_DEG_LAT,
      longitude: 8.0,
      altitude: 400 + Math.sin(t / 60) * 5,
      speed,
      accuracy: 5,
      segment,
    });
  }
  return points;
}

function assertClose(name: string, actual: number, expected: number, tolerance: number) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${actual.toFixed(2)}, expected ~${expected} (±${tolerance})`);
  if (!ok) process.exitCode = 1;
}

// 15 min at 3.333 m/s (5:00/km) → 3 km
const run = syntheticRun(900, 10 / 3);

const cum = buildCumulative(run);
assertClose('total distance (m)', cum[cum.length - 1].d, 3000, 15);
assertClose('total moving time (s)', cum[cum.length - 1].t, 900, 1);

const splits = computeSplits(run, 1000);
assertClose('split count', splits.length, 3, 0);
for (const s of splits) assertClose(`split ${s.index} pace (s/km)`, s.paceSecPerKm, 300, 5);

const best1k = bestWindowTimeS(run, 1000);
assertClose('best 1k (s)', best1k ?? NaN, 300, 5);
console.log(`PASS best 5k on 3k run: ${bestWindowTimeS(run, 5000) === null ? 'null as expected' : 'FAIL'}`);

// Negative-split run: 1 km slow (6:00/km) then, after a pause, 1 km fast (4:00/km)
const slow = syntheticRun(360, 1000 / 360);
const fastStartLat = slow[slow.length - 1].latitude + 50 / METERS_PER_DEG_LAT;
const fast = syntheticRun(240, 1000 / 240, 1, fastStartLat).map((p) => ({
  ...p,
  timestamp: p.timestamp + 361_000 + 60_000, // 60s pause gap
}));
const negativeSplitRun = [...slow, ...fast];

const cum2 = buildCumulative(negativeSplitRun);
// Pause gap (60s + 50m jump) must not leak into moving time/distance
assertClose('two-segment distance (m)', cum2[cum2.length - 1].d, 2000, 15);
assertClose('two-segment moving time (s)', cum2[cum2.length - 1].t, 600, 2);
assertClose('best 1k of negative-split run (s)', bestWindowTimeS(negativeSplitRun, 1000) ?? NaN, 240, 5);

const splits2 = computeSplits(negativeSplitRun, 1000);
assertClose('negative-split split 1 pace', splits2[0].paceSecPerKm, 360, 6);
assertClose('negative-split split 2 pace', splits2[1].paceSecPerKm, 240, 6);

// Haversine reference: Zurich → Bern ≈ 95.2 km
assertClose('haversine Zurich→Bern (km)', haversineM(47.3769, 8.5417, 46.948, 7.4474) / 1000, 95.2, 1.5);

console.log(process.exitCode === 1 ? '\nSome checks FAILED' : '\nAll checks passed');
