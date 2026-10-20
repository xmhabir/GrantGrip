import { Suspense } from "react";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { ShieldCheck, Bell } from "lucide-react";
import { SidebarNav } from "@/components/layout/SidebarNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md hidden md:flex flex-col">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 px-6 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-600 to-teal-700 bg-clip-text text-transparent">
            GrantGrip
          </span>
        </div>

        {/* Organization Switcher */}
        <div className="p-4 border-b border-border">
          <Suspense fallback={<div className="h-8 w-full animate-pulse rounded-lg bg-muted" />}>
            <OrganizationSwitcher
              hidePersonal
              afterCreateOrganizationUrl="/app"
              afterSelectOrganizationUrl="/app"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  organizationSwitcherTrigger:
                    "w-full justify-between border border-border bg-background/80 hover:bg-background px-3 py-2 rounded-lg text-xs font-medium",
                },
              }}
            />
          </Suspense>
        </div>

        {/* Navigation — client component for active-state detection */}
        <SidebarNav />

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-border">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
            <div className="font-semibold text-emerald-800 dark:text-emerald-300">Reporting Dashboard</div>
            <div className="mt-1 text-muted-foreground">Manage grants &amp; deadlines.</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Header */}
        <header className="h-16 border-b border-border glass-panel flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-foreground">Workspace Overview</h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-600 ring-2 ring-background" />
            </button>

            {/* Clerk User Profile */}
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <Suspense fallback={<div className="h-8 w-8 animate-pulse rounded-full bg-muted" />}>
                <UserButton />
              </Suspense>
            </div>
          </div>
        </header>

        {/* App Page Content */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
