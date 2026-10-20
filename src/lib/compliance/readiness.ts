import { Requirement } from "@/lib/db/schema";

/**
 * Calculates readiness percentage (0 to 1) for a report's requirements.
 * Per Decision D-013: returns 0 (not NaN) when requirements array is empty.
 */
export function calculateReadiness(
  requirements: Array<Pick<Requirement, "status">>
): number {
  if (requirements.length === 0) {
    return 0;
  }

  const satisfied = requirements.filter(
    (r) => r.status === "provided" || r.status === "verified"
  ).length;

  return satisfied / requirements.length;
}

/**
 * Formats a readiness ratio (0 to 1) into an integer percentage string, e.g. "75%".
 */
export function formatReadinessPercent(readiness: number): string {
  if (isNaN(readiness) || readiness < 0) return "0%";
  return `${Math.round(readiness * 100)}%`;
}
