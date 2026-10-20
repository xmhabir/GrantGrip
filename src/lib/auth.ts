import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClerkClient } from "@clerk/backend";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, users, memberships } from "@/lib/db/schema";
import { env } from "@/lib/env";

export type OrgRole = "admin" | "member";

export interface AuthContext {
  userId: string; // Internal PostgreSQL UUID of users.id
  orgId: string; // Internal PostgreSQL UUID of organizations.id
  role: OrgRole;
  clerkUserId: string;
  clerkOrgId: string;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden: Insufficient organization permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class OrganizationRequiredError extends Error {
  constructor(message = "Active organization required. Please select or create an organization.") {
    super(message);
    this.name = "OrganizationRequiredError";
  }
}

/**
 * Normalizes Clerk org roles ("org:admin" | "org:member" or custom) to internal 'admin' | 'member'
 */
export function normalizeClerkRole(clerkRole?: string | null): OrgRole {
  if (clerkRole === "org:admin" || clerkRole === "admin") {
    return "admin";
  }
  return "member";
}

/**
 * Lazy initializer for Clerk backend client using validated server secret key.
 */
function getClerkBackendClient() {
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
}

/**
 * Resolves the current request's organization membership and enforces role authorization.
 * 
 * Guarantees:
 * 1. D-003: Returned orgId and userId are ALWAYS internal PostgreSQL UUIDs.
 * 2. D-004: JIT upsert: if the user/org/membership is missing from local DB (e.g. webhook delayed),
 *    fetches from Clerk API synchronously and upserts before proceeding.
 * 3. Enforces minRole hierarchy ('admin' > 'member').
 */
export async function requireOrgRole(
  minRole: OrgRole = "member",
  options: { redirectIfNoOrg?: boolean } = { redirectIfNoOrg: true }
): Promise<AuthContext> {
  const session = await auth();

  if (!session || !session.userId) {
    throw new UnauthorizedError();
  }

  if (!session.orgId) {
    if (options.redirectIfNoOrg) {
      redirect("/select-org");
    }
    throw new OrganizationRequiredError();
  }

  const clerkUserId = session.userId;
  const clerkOrgId = session.orgId;
  const sessionRole = normalizeClerkRole(session.orgRole);

  // 1. Check local DB for existing user and organization
  let localOrg = await db.query.organizations.findFirst({
    where: eq(organizations.clerkOrgId, clerkOrgId),
  });

  let localUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  // 2. Decision D-004: JIT upsert if org or user is missing locally
  const clerk = getClerkBackendClient();

  if (!localOrg) {
    const clerkOrg = await clerk.organizations.getOrganization({
      organizationId: clerkOrgId,
    });

    const [upsertedOrg] = await db
      .insert(organizations)
      .values({
        clerkOrgId: clerkOrg.id,
        name: clerkOrg.name,
        slug: clerkOrg.slug || `org-${clerkOrg.id.slice(4)}`,
        timezone: "America/New_York",
      })
      .onConflictDoUpdate({
        target: organizations.clerkOrgId,
        set: {
          name: clerkOrg.name,
          updatedAt: new Date(),
        },
      })
      .returning();

    localOrg = upsertedOrg;
  }

  if (!localUser) {
    const clerkUserObj = await clerk.users.getUser(clerkUserId);
    const primaryEmail =
      clerkUserObj.emailAddresses.find((e) => e.id === clerkUserObj.primaryEmailAddressId)
        ?.emailAddress || clerkUserObj.emailAddresses[0]?.emailAddress || "user@example.com";

    const [upsertedUser] = await db
      .insert(users)
      .values({
        clerkUserId: clerkUserObj.id,
        email: primaryEmail,
        firstName: clerkUserObj.firstName,
        lastName: clerkUserObj.lastName,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          email: primaryEmail,
          firstName: clerkUserObj.firstName,
          lastName: clerkUserObj.lastName,
          updatedAt: new Date(),
        },
      })
      .returning();

    localUser = upsertedUser;
  }

  // 3. Check / JIT upsert membership
  let localMembership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.organizationId, localOrg.id),
      eq(memberships.userId, localUser.id)
    ),
  });

  if (!localMembership) {
    const [upsertedMembership] = await db
      .insert(memberships)
      .values({
        organizationId: localOrg.id,
        userId: localUser.id,
        role: sessionRole,
      })
      .onConflictDoUpdate({
        target: [memberships.organizationId, memberships.userId],
        set: {
          role: sessionRole,
          updatedAt: new Date(),
        },
      })
      .returning();

    localMembership = upsertedMembership;
  }

  const effectiveRole = (localMembership.role as OrgRole) || sessionRole;

  // 4. Role authorization check
  if (minRole === "admin" && effectiveRole !== "admin") {
    throw new ForbiddenError("Admin access required for this action");
  }

  return {
    userId: localUser.id,
    orgId: localOrg.id,
    role: effectiveRole,
    clerkUserId,
    clerkOrgId,
  };
}
