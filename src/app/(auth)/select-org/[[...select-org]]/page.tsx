import { Suspense } from "react";
import { OrganizationList } from "@clerk/nextjs";

export const metadata = {
  title: "Select Organization — GrantGrip",
  description: "Select or create an organization to access your GrantGrip workspace.",
};

export default function SelectOrganizationPage() {
  return (
    <div className="flex flex-col items-center justify-center space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Select or Create Organization
        </h1>
        <p className="text-sm text-muted-foreground">
          GrantGrip workspaces are scoped to your nonprofit organization.
        </p>
      </div>

      <div className="w-full flex justify-center">
        <Suspense
          fallback={
            <div className="flex h-72 w-full items-center justify-center rounded-2xl border border-border glass-panel">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          }
        >
          <OrganizationList
            hidePersonal
            afterSelectOrganizationUrl="/app"
            afterCreateOrganizationUrl="/app"
            appearance={{
              elements: {
                rootBox: "w-full flex justify-center",
                card: "shadow-xl border border-border rounded-2xl glass-panel w-full",
                primaryButton: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
                organizationSwitcherTrigger: "border border-border",
              },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
