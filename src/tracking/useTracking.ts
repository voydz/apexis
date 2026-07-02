import { useEffect, useState } from 'react';
import type { LiveStats } from '../types';
import { trackingEngine } from './engine';

export function useTracking(): LiveStats {
  const [stats, setStats] = useState<LiveStats>(() => ({
    state: 'idle',
    startedAt: null,
    elapsedMs: 0,
    movingMs: 0,
    distanceM: 0,
    currentPaceSecPerKm: null,
    avgPaceSecPerKm: null,
    avgSpeedMs: null,
    currentSpeedMs: null,
    elevationGainM: 0,
    elevationLossM: 0,
    altitudeM: null,
    steps: 0,
    cadenceSpm: null,
    caloriesKcal: 0,
    splits: [],
    points: [],
    gpsAccuracyM: null,
  }));

  useEffect(() => trackingEngine.subscribe(setStats), []);
  return stats;
}
