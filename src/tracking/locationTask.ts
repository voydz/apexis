import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { LOCATION_TASK, trackingEngine } from './engine';

/**
 * Background location task. Must be defined in module scope and imported
 * at app startup (see App.tsx) so it survives backgrounding.
 */
TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  trackingEngine.ingest(data.locations);
});
