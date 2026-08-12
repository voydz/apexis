import { getRunWithPoints, markRunSyncedToHealth } from '../db/runRepository';
import { saveRunToHealth } from './index';

/**
 * Exports a stored run to the health store unless it is already linked.
 * Returns the health-store record id, or null when export wasn't possible.
 */
export async function exportRunToHealth(runId: string): Promise<string | null> {
  const run = await getRunWithPoints(runId);
  if (!run) return null;
  if (run.healthWorkoutUuid) return run.healthWorkoutUuid;
  const healthUuid = await saveRunToHealth(run, run.points);
  if (healthUuid) await markRunSyncedToHealth(runId, healthUuid);
  return healthUuid;
}
