import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships, users } from "@/lib/db/schema";

export interface OrgMember {
  id: string; // internal user UUID
  name: string;
  email: string;
  role: string;
}

/**
 * Lists all active users belonging to an organization.
 */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, orgId));

  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
    email: r.email,
    role: r.role,
  }));
}
