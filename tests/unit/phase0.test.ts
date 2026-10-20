import { describe, it, expect } from "vitest";
import { env } from "@/lib/env";
import { PLANS, DEFAULT_PLAN } from "@/lib/billing/plans";
import { checkPlanLimits } from "@/lib/billing/limits";
import { calculateReadiness, formatReadinessPercent } from "@/lib/compliance/readiness";
import * as schema from "@/lib/db/schema";

describe("Phase 0 Foundation Tests", () => {
  it("loads validated environment variables with defaults", () => {
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-4-5");
    expect(env.R2_BUCKET_NAME).toBe("grantgrip-files");
    expect(env.DATABASE_URL).toBeDefined();
  });

  it("exports all required database schema tables", () => {
    expect(schema.organizations).toBeDefined();
    expect(schema.users).toBeDefined();
    expect(schema.memberships).toBeDefined();
    expect(schema.grants).toBeDefined();
    expect(schema.grantDocuments).toBeDefined();
    expect(schema.reports).toBeDefined();
    expect(schema.requirements).toBeDefined();
    expect(schema.evidence).toBeDefined();
    expect(schema.aiSuggestions).toBeDefined();
    expect(schema.reminderRules).toBeDefined();
    expect(schema.reminderLog).toBeDefined();
    expect(schema.activityLogs).toBeDefined();
    expect(schema.aiUsage).toBeDefined();
    expect(schema.exportJobs).toBeDefined();
  });

  it("defines billing plans correctly with required limits", () => {
    expect(PLANS.starter).toBeDefined();
    expect(PLANS.pro).toBeDefined();
    expect(PLANS.growth).toBeDefined();

    expect(PLANS.starter.maxActiveGrants).toBe(10);
    expect(PLANS.starter.maxUsers).toBe(3);
    expect(PLANS.starter.aiRequestsPerMonth).toBe(20);

    expect(PLANS.pro.maxActiveGrants).toBe(30);
    expect(PLANS.pro.maxUsers).toBe(10);
    expect(PLANS.pro.aiRequestsPerMonth).toBe(50);

    expect(PLANS.growth.maxActiveGrants).toBe(100);
    expect(PLANS.growth.maxUsers).toBe(25);
    expect(PLANS.growth.aiRequestsPerMonth).toBe(150);

    expect(DEFAULT_PLAN).toBe("starter");
  });

  it("enforces plan limits check correctly", async () => {
    const underLimit = await checkPlanLimits("test-org", "create_grant", {
      planId: "starter",
      currentUsage: 5,
    });
    expect(underLimit.allowed).toBe(true);

    const atLimit = await checkPlanLimits("test-org", "create_grant", {
      planId: "starter",
      currentUsage: 10,
    });
    expect(atLimit.allowed).toBe(false);
    expect(atLimit.reason).toContain("Starter plan allows up to 10 active grants");
  });

  it("calculates readiness according to D-013: 0 for empty requirements, never NaN", () => {
    expect(calculateReadiness([])).toBe(0);
    expect(formatReadinessPercent(calculateReadiness([]))).toBe("0%");

    expect(
      calculateReadiness([
        { status: "open" },
        { status: "provided" },
      ])
    ).toBe(0.5);

    expect(
      formatReadinessPercent(
        calculateReadiness([
          { status: "verified" },
          { status: "provided" },
        ])
      )
    ).toBe("100%");
  });
});
