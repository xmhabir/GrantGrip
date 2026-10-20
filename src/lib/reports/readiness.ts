export interface RequirementStatusCounts {
  total: number;
  open: number;
  provided: number;
  verified: number;
}

export interface ReadinessResult {
  total: number;
  open: number;
  provided: number;
  verified: number;
  ratio: number; // 0.0 to 1.0
  percentage: number; // 0 to 100 integer
  isReady: boolean; // true when total > 0 and open === 0 (all provided or verified)
}

/**
 * Calculates the readiness score for a report given its requirements or status counts.
 * Formula: (provided + verified) / total
 * Returns 0 (not NaN) when total === 0.
 */
export function calculateReadiness(
  requirementsOrCounts:
    | Array<{ status: string }>
    | RequirementStatusCounts
): ReadinessResult {
  let counts: RequirementStatusCounts;

  if (Array.isArray(requirementsOrCounts)) {
    counts = requirementsOrCounts.reduce<RequirementStatusCounts>(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "verified") {
          acc.verified += 1;
        } else if (item.status === "provided") {
          acc.provided += 1;
        } else {
          acc.open += 1;
        }
        return acc;
      },
      { total: 0, open: 0, provided: 0, verified: 0 }
    );
  } else {
    counts = requirementsOrCounts;
  }

  if (counts.total <= 0) {
    return {
      total: 0,
      open: 0,
      provided: 0,
      verified: 0,
      ratio: 0,
      percentage: 0,
      isReady: false,
    };
  }

  const satisfied = counts.provided + counts.verified;
  const ratio = satisfied / counts.total;
  const percentage = Math.round(ratio * 100);
  const isReady = counts.open === 0 && counts.total > 0;

  return {
    ...counts,
    ratio,
    percentage,
    isReady,
  };
}
