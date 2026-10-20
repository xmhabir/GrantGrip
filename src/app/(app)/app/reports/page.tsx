import { Suspense } from "react";
import { listReports } from "@/lib/repositories/reports";
import { listGrants } from "@/lib/repositories/grants";
import { requireOrgRole } from "@/lib/auth";
import { ReportsClientShell } from "./ReportsClientShell";

export const metadata = {
  title: "Reports & Deadlines — GrantGrip",
  description: "Track all grant reporting deadlines across your organization.",
};

export default async function ReportsPage() {
  const { orgId } = await requireOrgRole("member");
  const [reports, grants] = await Promise.all([listReports(orgId), listGrants(orgId)]);

  return (
    <Suspense fallback={<ReportsPageSkeleton />}>
      <ReportsClientShell initialReports={reports} grants={grants} />
    </Suspense>
  );
}

function ReportsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
