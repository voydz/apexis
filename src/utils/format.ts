import type { DistanceUnit } from '../types';

export const KM_PER_MILE = 1.609344;
export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.28084;

export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === 'metric' ? 'km' : 'mi';
}

export function elevationUnitLabel(unit: DistanceUnit): string {
  return unit === 'metric' ? 'm' : 'ft';
}

export function paceUnitLabel(unit: DistanceUnit): string {
  return unit === 'metric' ? '/km' : '/mi';
}

export function speedUnitLabel(unit: DistanceUnit): string {
  return unit === 'metric' ? 'km/h' : 'mph';
}

/** Split length in meters for the given unit system. */
export function splitLengthM(unit: DistanceUnit): number {
  return unit === 'metric' ? 1000 : METERS_PER_MILE;
}

export function formatDistance(meters: number, unit: DistanceUnit, decimals = 2): string {
  const value = unit === 'metric' ? meters / 1000 : meters / METERS_PER_MILE;
  return value.toFixed(decimals);
}

export function formatElevation(meters: number, unit: DistanceUnit): string {
  const value = unit === 'metric' ? meters : meters * FEET_PER_METER;
  return Math.round(value).toString();
}

/** "1:02:34" for >= 1h, otherwise "12:34". */
export function formatDuration(ms: number): string {
  const totalS = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Pace stored as sec/km; converts to sec/mi for imperial. Returns "5:12". */
export function formatPace(secPerKm: number | null, unit: DistanceUnit): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const sec = unit === 'metric' ? secPerKm : secPerKm * KM_PER_MILE;
  if (sec > 3599) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatSpeed(ms: number | null, unit: DistanceUnit): string {
  if (ms == null || ms < 0) return '--';
  const v = unit === 'metric' ? ms * 3.6 : (ms * 3.6) / KM_PER_MILE;
  return v.toFixed(1);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${formatDate(ts)} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/** Auto-title like "Morning Run" based on start hour. */
export function runTitleForTime(ts: number): string {
  const h = new Date(ts).getHours();
  if (h < 5) return 'Night Run';
  if (h < 11) return 'Morning Run';
  if (h < 14) return 'Lunch Run';
  if (h < 18) return 'Afternoon Run';
  if (h < 22) return 'Evening Run';
  return 'Night Run';
}
