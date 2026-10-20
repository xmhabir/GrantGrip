import Link from "next/link";
import { requireOrgRole } from "@/lib/auth";
import { listGrants } from "@/lib/repositories/grants";
import { listReports } from "@/lib/repositories/reports";
import { db } from "@/lib/db";
import { organizations, requirements } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  Award,
  CalendarCheck2,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
  Activity,
  UserCheck,
  ChevronRight,
} from "lucide-react";

export const instant = false;

export const metadata = {
  title: "Dashboard — GrantGrip",
  description: "Overview of your grant portfolio and upcoming deadlines.",
};

function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function AppDashboardPage() {
  const { orgId, userId } = await requireOrgRole("member");

  const [grants, reports, org, myTasks] = await Promise.all([
    listGrants(orgId),
    listReports(orgId),
    db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { name: true, plan: true },
    }),
    db.query.requirements.findMany({
      where: and(
        eq(requirements.organizationId, orgId),
        eq(requirements.assigneeUserId, userId),
        eq(requirements.status, "open")
      ),
      limit: 6,
    }),
  ]);

  const activeGrants = grants.filter((g) => g.status === "active");
  const draftReports = reports.filter((r) => r.status === "draft");
  const overdueReports = draftReports.filter((r) => getDaysUntilDue(r.dueDate) < 0);
  const dueIn7Days = draftReports.filter((r) => {
    const d = getDaysUntilDue(r.dueDate);
    return d >= 0 && d <= 7;
  });
  const dueIn30Days = draftReports.filter((r) => {
    const d = getDaysUntilDue(r.dueDate);
    return d > 7 && d <= 30;
  });

  const submittedThisMonth = reports.filter((r) => {
    if (r.status !== "submitted" && r.status !== "approved") return false;
    if (!r.submittedAt) return false;
    const sub = new Date(r.submittedAt);
    const now = new Date();
    return sub.getMonth() === now.getMonth() && sub.getFullYear() === now.getFullYear();
  });

  // Overall portfolio readiness
  const onTrack = draftReports.filter((r) => getDaysUntilDue(r.dueDate) > 7).length;
  const totalTracked = draftReports.length + submittedThisMonth.length;
  const readiness =
    totalTracked === 0
      ? 100
      : Math.round(((onTrack + submittedThisMonth.length) / totalTracked) * 100);

  const grantMap: Record<string, string> = {};
  for (const g of grants) grantMap[g.id] = g.funderName;

  const planLabel = org?.plan
    ? org.plan.charAt(0).toUpperCase() + org.plan.slice(1)
    : "Starter";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {org?.name ?? "Your workspace"} · {planLabel} plan
        </p>
      </div>

      {/* KPI stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Grants"
          value={activeGrants.length}
          icon={Award}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-500/10"
          href="/app/grants"
          linkText="View all grants"
        />
        <StatCard
          label="Overdue Reports"
          value={overdueReports.length}
          icon={AlertTriangle}
          iconColor={overdueReports.length > 0 ? "text-red-500" : "text-muted-foreground"}
          iconBg={overdueReports.length > 0 ? "bg-red-500/10" : "bg-muted/50"}
          highlight={overdueReports.length > 0}
          href="/app/reports"
          linkText={overdueReports.length > 0 ? "Action needed" : "All caught up"}
        />
        <StatCard
          label="Due in 30 Days"
          value={dueIn7Days.length + dueIn30Days.length}
          icon={Clock}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
          href="/app/reports"
          linkText="View deadlines"
        />
        <StatCard
          label="Submitted This Month"
          value={submittedThisMonth.length}
          icon={CheckCircle2}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
          href="/app/reports"
          linkText="View submitted"
        />
      </div>

      {/* Main Grid: Deadlines + Attention & Quick Actions */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Deadlines Section (Grouped: Overdue, Next 7 Days, Next 30 Days) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarCheck2 className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-foreground">Upcoming Reporting Deadlines</h2>
              </div>
              <Link
                href="/app/reports"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-emerald-600 transition-colors"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {draftReports.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-2 text-emerald-500/50" />
                <p className="text-sm font-medium">No pending deadlines</p>
                <p className="text-xs mt-1">All reports are submitted or approved.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {overdueReports.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-red-500">
                      Overdue ({overdueReports.length})
                    </h3>
                    <div className="space-y-2">
                      {overdueReports.map((report) => (
                        <DeadlineItem
                          key={report.id}
                          report={report}
                          grantName={grantMap[report.grantId]}
                          days={getDaysUntilDue(report.dueDate)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {dueIn7Days.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                      Next 7 Days ({dueIn7Days.length})
                    </h3>
                    <div className="space-y-2">
                      {dueIn7Days.map((report) => (
                        <DeadlineItem
                          key={report.id}
                          report={report}
                          grantName={grantMap[report.grantId]}
                          days={getDaysUntilDue(report.dueDate)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {dueIn30Days.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Next 30 Days ({dueIn30Days.length})
                    </h3>
                    <div className="space-y-2">
                      {dueIn30Days.map((report) => (
                        <DeadlineItem
                          key={report.id}
                          report={report}
                          grantName={grantMap[report.grantId]}
                          days={getDaysUntilDue(report.dueDate)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Needs My Attention Panel */}
          {myTasks.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-foreground">Needs My Attention</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Items specifically assigned to you that are currently awaiting evidence or review.
              </p>
              <div className="divide-y divide-border rounded-xl border border-border bg-background/50 overflow-hidden">
                {myTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/app/reports/${task.reportId}`}
                    className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        Type: {task.requirementType} {task.dueDate && `· Due ${task.dueDate}`}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Readiness + Quick Actions Sidebar */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-foreground">Grant Readiness</h2>
            </div>
            <div className="flex items-end gap-3 mb-3">
              <span className="text-4xl font-bold text-foreground">{readiness}%</span>
              <span className="mb-1 text-sm text-muted-foreground">on track</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
                style={{ width: `${readiness}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {overdueReports.length > 0
                ? `${overdueReports.length} report${overdueReports.length > 1 ? "s are" : " is"} overdue and need${overdueReports.length === 1 ? "s" : ""} attention.`
                : dueIn7Days.length > 0
                ? `${dueIn7Days.length} report${dueIn7Days.length > 1 ? "s are" : " is"} due within a week.`
                : "Portfolio compliance is in good standing."}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-foreground">Quick Actions</h2>
            </div>
            <div className="space-y-2">
              <Link
                href="/app/grants"
                className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2.5 text-sm font-medium hover:border-emerald-500/30 hover:bg-background transition-all group"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <Award className="h-4 w-4 text-emerald-600" />
                  Manage Grants
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
              </Link>
              <Link
                href="/app/reports"
                className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2.5 text-sm font-medium hover:border-emerald-500/30 hover:bg-background transition-all group"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <CalendarCheck2 className="h-4 w-4 text-emerald-600" />
                  View All Deadlines
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeadlineItem({
  report,
  grantName,
  days,
}: {
  report: any;
  grantName?: string;
  days: number;
}) {
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 7;

  return (
    <Link
      href={`/app/reports/${report.id}`}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-3 hover:bg-background hover:border-emerald-500/40 transition-all group"
    >
      <div
        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
          isOverdue ? "bg-red-500" : isUrgent ? "bg-amber-500" : "bg-blue-400"
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground group-hover:text-emerald-600 transition-colors truncate">
          {report.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{grantName ?? ""}</p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-xs font-semibold ${
            isOverdue ? "text-red-500" : isUrgent ? "text-amber-500" : "text-muted-foreground"
          }`}
        >
          {isOverdue
            ? `${Math.abs(days)}d overdue`
            : days === 0
            ? "Due today"
            : `${days}d left`}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(report.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
    </Link>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  highlight?: boolean;
  href: string;
  linkText: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  highlight,
  href,
  linkText,
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border bg-card p-5 transition-all ${
        highlight && value > 0
          ? "border-red-500/30 shadow-sm shadow-red-500/10"
          : "border-border hover:border-emerald-500/20 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {highlight && value > 0 && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-500 animate-pulse">
            !
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      </div>
      <Link
        href={href}
        className={`mt-4 flex items-center gap-1 text-xs font-medium transition-colors ${
          highlight && value > 0
            ? "text-red-500 hover:text-red-600"
            : "text-muted-foreground hover:text-emerald-600"
        }`}
      >
        {linkText} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
