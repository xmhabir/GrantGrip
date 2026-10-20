"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  CheckCircle,
  AlertCircle,
  FileBox,
  History,
  ExternalLink,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { CreateReportModal } from "@/components/reports/CreateReportModal";
import { updateGrantAction, deleteGrantAction } from "@/lib/actions/grants";
import { dollarsToCents } from "@/lib/validations/grants";
import type { Grant, Report, ActivityLog } from "@/lib/db/schema";

interface GrantDetailShellProps {
  grant: Grant;
  reports: Report[];
  activities: ActivityLog[];
  userRole: string;
}

type TabType = "overview" | "reports" | "documents" | "activity";

export function GrantDetailShell({
  grant,
  reports,
  activities,
  userRole,
}: GrantDetailShellProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const formattedAmount = grant.awardAmountCents
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: grant.currency || "USD",
        maximumFractionDigits: 0,
      }).format(grant.awardAmountCents / 100)
    : "Not specified";

  const nextUpcomingReport = reports
    .filter((r) => r.status === "draft")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  const handleDelete = () => {
    if (!confirm(`Are you sure you want to delete "${grant.funderName}"? This will archive all associated reports.`)) {
      return;
    }
    startDeleteTransition(async () => {
      const res = await deleteGrantAction(grant.id);
      if (res.success) {
        router.push("/app/grants");
      } else {
        alert(res.error || "Failed to delete grant");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/app/grants"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Grant Workspace
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 capitalize">
                {grant.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {grant.funderName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Edit className="h-4 w-4" />
            Edit Grant
          </button>
          {userRole === "admin" && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-8" aria-label="Tabs">
          {[
            { id: "overview", label: "Overview", icon: Award },
            { id: "reports", label: `Reports (${reports.length})`, icon: FileText },
            { id: "documents", label: "Documents", icon: FileBox },
            { id: "activity", label: `Activity (${activities.length})`, icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`inline-flex items-center gap-2 border-b-2 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <span className="text-xs font-medium uppercase tracking-wider">Award Amount</span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {formattedAmount}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="h-5 w-5 text-blue-500" />
                <span className="text-xs font-medium uppercase tracking-wider">Grant Period</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {grant.startDate && grant.endDate
                  ? `${grant.startDate} → ${grant.endDate}`
                  : grant.startDate
                  ? `Starts ${grant.startDate}`
                  : "No period configured"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Clock className="h-5 w-5 text-amber-500" />
                <span className="text-xs font-medium uppercase tracking-wider">Next Deadline</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {nextUpcomingReport ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {nextUpcomingReport.dueDate} ({nextUpcomingReport.title})
                  </span>
                ) : (
                  "No upcoming reports"
                )}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <FileText className="h-5 w-5 text-purple-500" />
                <span className="text-xs font-medium uppercase tracking-wider">Reports Due</span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {reports.length}
              </p>
            </div>
          </div>

          {/* Details Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Grant Details</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Program Area
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {grant.programArea || "General / Unrestricted"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Opportunity / Reference #
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {grant.opportunityNumber || "None"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notes & Compliance Requirements
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {grant.notes || "No notes entered for this grant."}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Tab 2: Reports */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Grant Reports</h2>
            <button
              onClick={() => setShowCreateReportModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              Add Report
            </button>
          </div>

          {reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-base font-semibold text-foreground">No reports configured yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add progress, financial, or final reporting obligations to stay on top of deadlines.
              </p>
              <button
                onClick={() => setShowCreateReportModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />
                Add First Report
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-col items-start justify-between gap-4 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground capitalize">
                        {report.reportType}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          report.status === "submitted"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : report.status === "approved"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {report.status}
                      </span>
                    </div>
                    <Link
                      href={`/app/reports/${report.id}`}
                      className="text-base font-semibold text-foreground hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                    >
                      {report.title}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Due: {report.dueDate}</span>
                      {report.periodStart && report.periodEnd && (
                        <span>Period: {report.periodStart} to {report.periodEnd}</span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/app/reports/${report.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm hover:bg-accent"
                  >
                    Open Workspace
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Documents (Phase 3 Stub) */}
      {activeTab === "documents" && (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <FileBox className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold text-foreground">
            Grant Agreement & Source Documents
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            In Phase 3, you can upload award letters and grant agreements here to automatically extract reporting obligations, deadlines, and metrics via AI.
          </p>
        </div>
      )}

      {/* Tab 4: Activity Log */}
      {activeTab === "activity" && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Audit Log & Timeline</h2>
          {activities.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No activity recorded for this grant yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-border">
              {activities.map((act) => (
                <div key={act.id} className="py-3 flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      <span className="capitalize">{act.action}</span> {act.entityType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(act.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Grant Modal */}
      {showEditModal && (
        <EditGrantModal
          grant={grant}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {/* Create Report Modal */}
      {showCreateReportModal && (
        <CreateReportModal
          grants={[grant]}
          defaultGrantId={grant.id}
          onClose={() => setShowCreateReportModal(false)}
          onSuccess={(reportId) => {
            setShowCreateReportModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditGrantModal({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    const awardAmountDollars = formData.get("awardAmountDollars") as string;
    const payload = {
      funderName: (formData.get("funderName") as string).trim(),
      opportunityNumber: (formData.get("opportunityNumber") as string)?.trim() || null,
      awardAmountCents: awardAmountDollars ? dollarsToCents(awardAmountDollars) : null,
      startDate: (formData.get("startDate") as string) || null,
      endDate: (formData.get("endDate") as string) || null,
      status: formData.get("status") as any,
      programArea: (formData.get("programArea") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
    };

    startTransition(async () => {
      const res = await updateGrantAction(grant.id, payload);
      if (res.success) {
        onClose();
        router.refresh();
      } else {
        setError(res.error || "Failed to update grant");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-foreground">Edit Grant</h3>
        {error && (
          <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase text-muted-foreground">Funder Name</label>
            <input
              name="funderName"
              defaultValue={grant.funderName}
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Award Amount ($)</label>
              <input
                name="awardAmountDollars"
                type="number"
                step="0.01"
                defaultValue={grant.awardAmountCents ? grant.awardAmountCents / 100 : ""}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={grant.status}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Start Date</label>
              <input
                name="startDate"
                type="date"
                defaultValue={grant.startDate || ""}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">End Date</label>
              <input
                name="endDate"
                type="date"
                defaultValue={grant.endDate || ""}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase text-muted-foreground">Program Area</label>
            <input
              name="programArea"
              defaultValue={grant.programArea || ""}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase text-muted-foreground">Notes</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={grant.notes || ""}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
