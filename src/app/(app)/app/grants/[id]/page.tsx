import { notFound } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import { requireOrgRole } from "@/lib/auth";
import { getGrantById } from "@/lib/repositories/grants";
import { listReports } from "@/lib/repositories/reports";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { GrantDetailShell } from "./GrantDetailShell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const { orgId } = await requireOrgRole("member");
    const grant = await getGrantById(orgId, id);
    if (!grant) return { title: "Grant Not Found — GrantGrip" };
    return {
      title: `${grant.funderName} — GrantGrip`,
      description: `Grant details and reporting workspace for ${grant.funderName}`,
    };
  } catch {
    return { title: "Grant — GrantGrip" };
  }
}

export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await requireOrgRole("member");

  const grant = await getGrantById(orgId, id);
  if (!grant) {
    notFound();
  }

  const reports = await listReports(orgId, id);

  const activities = await db.query.activityLogs.findMany({
    where: and(
      eq(activityLogs.organizationId, orgId),
      eq(activityLogs.entityId, id)
    ),
    orderBy: [desc(activityLogs.createdAt)],
    limit: 50,
  });

  return (
    <GrantDetailShell
      grant={grant}
      reports={reports}
      activities={activities}
      userRole={role}
    />
  );
}
