import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, memberships } from "@/lib/db/schema";
import { PLANS, DEFAULT_PLAN } from "./plans";
import { PlanId } from "./types";

export type PlanAction = "create_grant" | "invite_user" | "ai_extraction";

export interface CheckLimitResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  maxAllowed: number;
}

/**
 * Checks if an organization is permitted to perform a restricted action under its active plan.
 * Reads the org's real plan from the DB and counts live rows for accurate enforcement.
 */
export async function checkPlanLimits(
  orgId: string,
  action: PlanAction,
  _mockOverrides?: { planId?: PlanId; currentUsage?: number }
): Promise<CheckLimitResult> {
  let planId: PlanId = _mockOverrides?.planId ?? DEFAULT_PLAN;

  if (!_mockOverrides?.planId) {
    // Fetch the org's plan from DB
    const { organizations } = await import("@/lib/db/schema");
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { plan: true },
    });
    planId = (org?.plan ?? DEFAULT_PLAN) as PlanId;
  }

  const plan = PLANS[planId] ?? PLANS[DEFAULT_PLAN];

  let currentUsage = _mockOverrides?.currentUsage ?? 0;
  let maxAllowed = 0;
  let actionLabel = "";

  switch (action) {
    case "create_grant": {
      maxAllowed = plan.maxActiveGrants;
      actionLabel = "active grants";
      if (_mockOverrides?.currentUsage === undefined) {
        // Count non-deleted active grants
        const rows = await db
          .select({ id: grants.id })
          .from(grants)
          .where(and(eq(grants.organizationId, orgId), isNull(grants.deletedAt)));
        currentUsage = rows.length;
      }
      break;
    }
    case "invite_user": {
      maxAllowed = plan.maxUsers;
      actionLabel = "team members";
      const rows = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.organizationId, orgId));
      currentUsage = rows.length;
      break;
    }
    case "ai_extraction": {
      // AI usage is tracked monthly via ai_usage table; checked separately by the AI module.
      // Here we apply a coarse per-month cap from the plan.
      maxAllowed = plan.aiRequestsPerMonth;
      actionLabel = "monthly AI extractions";
      const { aiUsage } = await import("@/lib/db/schema");
      const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      const row = await db.query.aiUsage.findFirst({
        where: and(eq(aiUsage.organizationId, orgId), eq(aiUsage.month, month)),
        columns: { requestCount: true },
      });
      currentUsage = row?.requestCount ?? 0;
      break;
    }
  }

  if (currentUsage >= maxAllowed) {
    return {
      allowed: false,
      reason: `Plan limit reached: your ${plan.name} plan allows up to ${maxAllowed} ${actionLabel}. Please upgrade to add more.`,
      currentUsage,
      maxAllowed,
    };
  }

  return {
    allowed: true,
    currentUsage,
    maxAllowed,
  };
}
