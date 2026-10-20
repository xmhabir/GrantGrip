import { Suspense } from "react";
import { listGrants } from "@/lib/repositories/grants";
import { requireOrgRole } from "@/lib/auth";
import { GrantsClientShell } from "./GrantsClientShell";

export const metadata = {
  title: "Grants — GrantGrip",
  description: "Manage all your active grants in one place.",
};

export default async function GrantsPage() {
  const { orgId } = await requireOrgRole("member");
  const grants = await listGrants(orgId);

  return (
    <Suspense fallback={<GrantsPageSkeleton />}>
      <GrantsClientShell initialGrants={grants} />
    </Suspense>
  );
}

function GrantsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
