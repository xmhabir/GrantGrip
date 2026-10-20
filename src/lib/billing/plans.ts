import { PlanId, PlanLimits } from "./types";

export const PLANS: Record<PlanId, PlanLimits> = {
  starter: {
    name: "Starter",
    priceMonthly: 49,
    maxActiveGrants: 10,
    maxUsers: 3,
    aiRequestsPerMonth: 20,
    features: [
      "Up to 10 active grants",
      "Up to 3 team members",
      "20 AI document extractions / month",
      "Deadline tracking & calendar view",
      "Email reminders & weekly digests",
    ],
  },
  pro: {
    name: "Pro",
    priceMonthly: 99,
    maxActiveGrants: 30,
    maxUsers: 10,
    aiRequestsPerMonth: 50,
    features: [
      "Up to 30 active grants",
      "Up to 10 team members",
      "50 AI document extractions / month",
      "AI narrative review assistant",
      "Full export pack generator",
      "Priority email support",
    ],
  },
  growth: {
    name: "Growth",
    priceMonthly: 199,
    maxActiveGrants: 100,
    maxUsers: 25,
    aiRequestsPerMonth: 150,
    features: [
      "Up to 100 active grants",
      "Up to 25 team members",
      "150 AI document extractions / month",
      "Advanced audit log export",
      "Dedicated onboarding assistance",
    ],
  },
};

export const DEFAULT_PLAN: PlanId = "starter";
