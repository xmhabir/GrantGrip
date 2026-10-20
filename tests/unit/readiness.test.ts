import { describe, it, expect } from "vitest";
import { calculateReadiness } from "@/lib/reports/readiness";

describe("calculateReadiness", () => {
  it("returns 0 and not NaN when total is 0 (empty array)", () => {
    const result = calculateReadiness([]);
    expect(result.total).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.percentage).toBe(0);
    expect(Number.isNaN(result.ratio)).toBe(false);
    expect(Number.isNaN(result.percentage)).toBe(false);
    expect(result.isReady).toBe(false);
  });

  it("returns 0 when total counts is 0", () => {
    const result = calculateReadiness({ total: 0, open: 0, provided: 0, verified: 0 });
    expect(result.total).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.percentage).toBe(0);
    expect(Number.isNaN(result.ratio)).toBe(false);
  });

  it("calculates ratio and percentage correctly for mixed requirements", () => {
    const requirements = [
      { status: "open" },
      { status: "provided" },
      { status: "verified" },
      { status: "open" },
    ];
    // 2 out of 4 satisfied = 50%
    const result = calculateReadiness(requirements);
    expect(result.total).toBe(4);
    expect(result.open).toBe(2);
    expect(result.provided).toBe(1);
    expect(result.verified).toBe(1);
    expect(result.ratio).toBe(0.5);
    expect(result.percentage).toBe(50);
    expect(result.isReady).toBe(false);
  });

  it("returns isReady = true when all requirements are provided or verified", () => {
    const requirements = [
      { status: "provided" },
      { status: "verified" },
      { status: "verified" },
    ];
    const result = calculateReadiness(requirements);
    expect(result.total).toBe(3);
    expect(result.open).toBe(0);
    expect(result.ratio).toBe(1.0);
    expect(result.percentage).toBe(100);
    expect(result.isReady).toBe(true);
  });

  it("returns 0% when all requirements are open", () => {
    const requirements = [{ status: "open" }, { status: "open" }];
    const result = calculateReadiness(requirements);
    expect(result.total).toBe(2);
    expect(result.open).toBe(2);
    expect(result.ratio).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.isReady).toBe(false);
  });
});
