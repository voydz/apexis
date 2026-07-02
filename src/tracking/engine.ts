import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import type { EventSubscription } from 'expo-modules-core';
import type { LiveStats, Run, TrackingState, TrackPoint } from '../types';
import { bestWindowTimeS, computeSplits, estimateCaloriesKcal } from '../utils/analysis';
import { haversineM } from '../utils/geo';
import { runTitleForTime } from '../utils/format';
import { saveRun } from '../db/runRepository';

export const LOCATION_TASK = 'apexis-location-task';

/** Reject fixes with worse horizontal accuracy than this (meters). */
const MAX_ACCURACY_M = 35;
/** Reject jumps implying faster movement than this (m/s ≈ world-record sprint). */
const MAX_PLAUSIBLE_SPEED = 12.5;
/** Auto-pause below this speed (m/s), resume above the high mark. */
const AUTO_PAUSE_SPEED = 0.6;
const AUTO_RESUME_SPEED = 1.2;
const AUTO_PAUSE_AFTER_S = 5;
/** Elevation hysteresis (meters) so GPS altitude noise doesn't inflate gain. */
const ELEVATION_THRESHOLD_M = 2;

export interface EngineConfig {
  autoPause: boolean;
  splitLengthM: number;
  weightKg: number;
}

type Listener = (stats: LiveStats) => void;

class TrackingEngine {
  private listeners = new Set<Listener>();
  private config: EngineConfig = { autoPause: true, splitLengthM: 1000, weightKg: 70 };

  private state: TrackingState = 'idle';
  private startedAt: number | null = null;
  private movingMs = 0;
  /**
   * Moving time snapshotted whenever distance last changed. Averages are
   * computed against this instead of the live clock so they don't creep
   * between GPS fixes and snap back on the next one.
   */
  private movingMsAtLastFix = 0;
  private lastTick = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;

  private points: TrackPoint[] = [];
  private segment = 0;
  private lastAccepted: TrackPoint | null = null;
  private distanceM = 0;
  private maxSpeedMs = 0;

  private smoothedAlt: number | null = null;
  private refAlt: number | null = null;
  private elevationGainM = 0;
  private elevationLossM = 0;

  private lowSpeedSince: number | null = null;
  private lastRawFix: Location.LocationObject | null = null;

  private steps = 0;
  private stepSamples: { t: number; steps: number }[] = [];
  private pedometerSub: EventSubscription | null = null;
  private foregroundSub: Location.LocationSubscription | null = null;
  private usingBackgroundUpdates = false;

  private cachedSplits: ReturnType<typeof computeSplits> = [];
  private splitsDirty = false;

  configure(config: EngineConfig) {
    this.config = config;
    this.splitsDirty = true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  isActive(): boolean {
    return this.state !== 'idle';
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.reset();
    this.state = 'tracking';
    this.startedAt = Date.now();
    this.lastTick = Date.now();

    await this.startLocationUpdates();
    this.startPedometer();

    this.ticker = setInterval(() => this.tick(), 1000);
    this.notify();
  }

  pause(): void {
    if (this.state !== 'tracking' && this.state !== 'autoPaused') return;
    this.tick();
    this.state = 'paused';
    this.onPauseEntered();
    this.notify();
  }

  resume(): void {
    if (this.state !== 'paused' && this.state !== 'autoPaused') return;
    this.state = 'tracking';
    this.lastTick = Date.now();
    this.onResume();
    this.notify();
  }

  /** Stops tracking, persists the run (if long enough), and resets. */
  async stop(): Promise<Run | null> {
    if (this.state === 'idle') return null;
    this.tick();
    await this.stopSensors();

    const endedAt = Date.now();
    const startedAt = this.startedAt ?? endedAt;
    let saved: Run | null = null;

    // Discard accidental sub-50m runs
    if (this.distanceM >= 50 && this.points.length >= 2) {
      const run: Run = {
        id: `run_${startedAt}_${Math.floor(Math.random() * 1e6)}`,
        title: runTitleForTime(startedAt),
        startedAt,
        endedAt,
        elapsedMs: endedAt - startedAt,
        movingMs: this.movingMs,
        distanceM: this.distanceM,
        elevationGainM: this.elevationGainM,
        elevationLossM: this.elevationLossM,
        caloriesKcal: estimateCaloriesKcal(this.distanceM, this.config.weightKg),
        steps: this.steps > 0 ? this.steps : null,
        avgCadenceSpm:
          this.steps > 0 && this.movingMs > 30_000
            ? this.steps / (this.movingMs / 60_000)
            : null,
        maxSpeedMs: this.maxSpeedMs > 0 ? this.maxSpeedMs : null,
        best1kS: bestWindowTimeS(this.points, 1000),
        best5kS: bestWindowTimeS(this.points, 5000),
        best10kS: bestWindowTimeS(this.points, 10000),
      };
      await saveRun(run, this.points);
      saved = run;
    }

    this.reset();
    this.state = 'idle';
    this.notify();
    return saved;
  }

  /** Stops tracking and throws the run away without saving. */
  async discard(): Promise<void> {
    if (this.state === 'idle') return;
    await this.stopSensors();
    this.reset();
    this.state = 'idle';
    this.notify();
  }

  /** Called by the background task and the foreground watcher. */
  ingest(locations: Location.LocationObject[]): void {
    if (this.state === 'idle') return;
    for (const loc of locations) this.processFix(loc);
    if (this.splitsDirty) {
      this.cachedSplits = computeSplits(this.points, this.config.splitLengthM);
      this.splitsDirty = false;
    }
    this.notify();
  }

  // --- internals ---

  private async startLocationUpdates(): Promise<void> {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.granted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        activityType: Location.ActivityType.Fitness,
        timeInterval: 1000,
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: 'Apexis is tracking your run',
          notificationBody: 'Recording distance, pace and elevation.',
          notificationColor: '#B7F542',
        },
      });
      this.usingBackgroundUpdates = true;
    } else {
      // Foreground-only fallback when background permission was declined
      this.foregroundSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => this.ingest([loc])
      );
      this.usingBackgroundUpdates = false;
    }
  }

  private startPedometer(): void {
    Pedometer.isAvailableAsync()
      .then(async (available) => {
        if (!available || this.state === 'idle') return;
        const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
        if (perm && !perm.granted) return;
        this.pedometerSub = Pedometer.watchStepCount((result) => {
          this.steps = result.steps;
          this.stepSamples.push({ t: Date.now(), steps: result.steps });
          const cutoff = Date.now() - 60_000;
          while (this.stepSamples.length > 2 && this.stepSamples[0].t < cutoff) {
            this.stepSamples.shift();
          }
        });
      })
      .catch(() => {});
  }

  private async stopSensors(): Promise<void> {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.pedometerSub?.remove();
    this.pedometerSub = null;
    this.foregroundSub?.remove();
    this.foregroundSub = null;
    if (this.usingBackgroundUpdates) {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
        if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      } catch {}
      this.usingBackgroundUpdates = false;
    }
  }

  private processFix(loc: Location.LocationObject): void {
    this.lastRawFix = loc;
    const { latitude, longitude, altitude, speed, accuracy } = loc.coords;
    const timestamp = loc.timestamp;

    if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

    const point: TrackPoint = {
      timestamp,
      latitude,
      longitude,
      altitude: altitude ?? null,
      speed: speed != null && speed >= 0 ? speed : null,
      accuracy: accuracy ?? null,
      segment: this.segment,
    };

    this.maybeAutoPauseOrResume(point);

    if (this.state !== 'tracking') return;

    if (this.lastAccepted && this.lastAccepted.segment === point.segment) {
      const dtS = (timestamp - this.lastAccepted.timestamp) / 1000;
      if (dtS <= 0) return;
      const dM = haversineM(
        this.lastAccepted.latitude,
        this.lastAccepted.longitude,
        latitude,
        longitude
      );
      if (dM / dtS > MAX_PLAUSIBLE_SPEED) return; // GPS teleport
      this.distanceM += dM;
      this.accumulateTime();
      this.movingMsAtLastFix = this.movingMs;
    }

    if (point.speed != null && point.speed > this.maxSpeedMs && point.speed <= MAX_PLAUSIBLE_SPEED) {
      this.maxSpeedMs = point.speed;
    }

    this.updateElevation(point);
    this.points.push(point);
    this.lastAccepted = point;
    if (this.points.length % 5 === 0) this.splitsDirty = true;
  }

  private maybeAutoPauseOrResume(point: TrackPoint): void {
    if (!this.config.autoPause) return;
    const speed = this.estimateSpeed(point);
    if (speed == null) return;

    if (this.state === 'tracking') {
      if (speed < AUTO_PAUSE_SPEED) {
        if (this.lowSpeedSince == null) this.lowSpeedSince = point.timestamp;
        else if ((point.timestamp - this.lowSpeedSince) / 1000 >= AUTO_PAUSE_AFTER_S) {
          this.tick();
          this.state = 'autoPaused';
          this.onPauseEntered();
        }
      } else {
        this.lowSpeedSince = null;
      }
    } else if (this.state === 'autoPaused' && speed > AUTO_RESUME_SPEED) {
      this.state = 'tracking';
      this.lastTick = Date.now();
      this.onResume();
    }
  }

  private estimateSpeed(point: TrackPoint): number | null {
    if (point.speed != null) return point.speed;
    if (!this.lastAccepted) return null;
    const dt = (point.timestamp - this.lastAccepted.timestamp) / 1000;
    if (dt <= 0) return null;
    return (
      haversineM(
        this.lastAccepted.latitude,
        this.lastAccepted.longitude,
        point.latitude,
        point.longitude
      ) / dt
    );
  }

  private updateElevation(point: TrackPoint): void {
    if (point.altitude == null) return;
    if (this.smoothedAlt == null) {
      this.smoothedAlt = point.altitude;
      this.refAlt = point.altitude;
      return;
    }
    this.smoothedAlt += 0.12 * (point.altitude - this.smoothedAlt);
    if (this.refAlt == null) this.refAlt = this.smoothedAlt;
    const diff = this.smoothedAlt - this.refAlt;
    if (diff > ELEVATION_THRESHOLD_M) {
      this.elevationGainM += diff;
      this.refAlt = this.smoothedAlt;
    } else if (diff < -ELEVATION_THRESHOLD_M) {
      this.elevationLossM += -diff;
      this.refAlt = this.smoothedAlt;
    }
  }

  private onPauseEntered(): void {
    this.lowSpeedSince = null;
  }

  private onResume(): void {
    this.segment += 1;
    this.lastAccepted = null;
    this.lowSpeedSince = null;
  }

  private accumulateTime(): void {
    const now = Date.now();
    if (this.state === 'tracking') {
      this.movingMs += now - this.lastTick;
    }
    this.lastTick = now;
  }

  private tick(): void {
    this.accumulateTime();
    this.notify();
  }

  private currentPace(): { pace: number | null; speed: number | null } {
    // Average speed over recent points in the current segment (last 15s)
    const cutoff = Date.now() - 15_000;
    const recent = this.points.filter(
      (p) => p.timestamp >= cutoff && p.segment === this.segment && p.speed != null
    );
    if (this.state !== 'tracking' || recent.length < 2) return { pace: null, speed: null };
    const avg = recent.reduce((s, p) => s + (p.speed as number), 0) / recent.length;
    if (avg < 0.4) return { pace: null, speed: avg };
    return { pace: 1000 / avg, speed: avg };
  }

  private currentCadence(): number | null {
    if (this.stepSamples.length < 2) return null;
    const first = this.stepSamples[0];
    const last = this.stepSamples[this.stepSamples.length - 1];
    const dtS = (last.t - first.t) / 1000;
    if (dtS < 10) return null;
    return ((last.steps - first.steps) / dtS) * 60;
  }

  private snapshot(): LiveStats {
    const { pace, speed } = this.currentPace();
    const avgS = this.movingMsAtLastFix / 1000;
    const hasAvg = this.distanceM > 20 && avgS > 5;
    return {
      state: this.state,
      startedAt: this.startedAt,
      elapsedMs: this.startedAt ? Date.now() - this.startedAt : 0,
      movingMs: this.movingMs,
      distanceM: this.distanceM,
      currentPaceSecPerKm: pace,
      avgPaceSecPerKm: hasAvg ? (avgS / this.distanceM) * 1000 : null,
      avgSpeedMs: hasAvg ? this.distanceM / avgS : null,
      currentSpeedMs: speed,
      elevationGainM: this.elevationGainM,
      elevationLossM: this.elevationLossM,
      altitudeM: this.smoothedAlt,
      steps: this.steps,
      cadenceSpm: this.currentCadence(),
      caloriesKcal: estimateCaloriesKcal(this.distanceM, this.config.weightKg),
      splits: this.cachedSplits,
      // Shallow copy so consumers relying on reference equality see updates
      points: [...this.points],
      gpsAccuracyM: this.lastRawFix?.coords.accuracy ?? null,
    };
  }

  private notify(): void {
    const stats = this.snapshot();
    this.listeners.forEach((l) => l(stats));
  }

  private reset(): void {
    this.startedAt = null;
    this.movingMs = 0;
    this.movingMsAtLastFix = 0;
    this.points = [];
    this.segment = 0;
    this.lastAccepted = null;
    this.distanceM = 0;
    this.maxSpeedMs = 0;
    this.smoothedAlt = null;
    this.refAlt = null;
    this.elevationGainM = 0;
    this.elevationLossM = 0;
    this.lowSpeedSince = null;
    this.lastRawFix = null;
    this.steps = 0;
    this.stepSamples = [];
    this.cachedSplits = [];
    this.splitsDirty = false;
  }
}

export const trackingEngine = new TrackingEngine();
