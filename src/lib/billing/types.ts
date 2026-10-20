export type PlanId = "starter" | "pro" | "growth";

export interface PlanLimits {
  name: string;
  priceMonthly: number;
  maxActiveGrants: number;
  maxUsers: number;
  aiRequestsPerMonth: number;
  features: string[];
}

export interface CustomerSubscription {
  organizationId: string;
  planId: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface BillingProvider {
  createCheckoutSession(params: {
    organizationId: string;
    planId: PlanId;
    customerEmail: string;
    returnUrl: string;
  }): Promise<{ checkoutUrl: string }>;

  createCustomerPortalSession(params: {
    organizationId: string;
    returnUrl: string;
  }): Promise<{ portalUrl: string }>;

  getSubscription(organizationId: string): Promise<CustomerSubscription | null>;
}
