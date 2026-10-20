import { notFound } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import { requireOrgRole } from "@/lib/auth";
import { getReportById } from "@/lib/repositories/reports";
import { getGrantById } from "@/lib/repositories/grants";
import { listRequirements } from "@/lib/repositories/requirements";
import { listOrgMembers } from "@/lib/repositories/members";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { ReportDetailShell } from "./ReportDetailShell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const { orgId } = await requireOrgRole("member");
    const report = await getReportById(orgId, id);
    if (!report) return { title: "Report Not Found — GrantGrip" };
    return {
      title: `${report.title} — GrantGrip`,
      description: `Report requirements and submission workspace for ${report.title}`,
    };
  } catch {
    return { title: "Report — GrantGrip" };
  }
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await requireOrgRole("member");

  const report = await getReportById(orgId, id);
  if (!report) {
    notFound();
  }

  const grant = await getGrantById(orgId, report.grantId);
  if (!grant) {
    notFound();
  }

  const [requirementsList, membersList, activities] = await Promise.all([
    listRequirements(orgId, id),
    listOrgMembers(orgId),
    db.query.activityLogs.findMany({
      where: and(
        eq(activityLogs.organizationId, orgId),
        eq(activityLogs.entityId, id)
      ),
      orderBy: [desc(activityLogs.createdAt)],
      limit: 50,
    }),
  ]);

  return (
    <ReportDetailShell
      report={report}
      grant={grant}
      requirements={requirementsList}
      members={membersList}
      activities={activities}
      userRole={role}
    />
  );
}
