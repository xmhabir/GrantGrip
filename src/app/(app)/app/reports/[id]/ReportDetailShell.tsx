"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  ShieldCheck,
  Trash2,
  Edit,
  User as UserIcon,
  FileText,
  TrendingUp,
  FolderOpen,
  Send,
  Loader2,
  Check,
  Paperclip,
} from "lucide-react";
import { EvidenceModal } from "@/components/evidence/EvidenceModal";
import { calculateReadiness } from "@/lib/reports/readiness";
import {
  createRequirementAction,
  updateRequirementAction,
  verifyRequirementAction,
  unverifyRequirementAction,
  deleteRequirementAction,
} from "@/lib/actions/requirements";
import { submitReportAction, updateReportAction, deleteReportAction } from "@/lib/actions/reports";
import type { Report, Grant, Requirement, ActivityLog } from "@/lib/db/schema";
import type { OrgMember } from "@/lib/repositories/members";

interface ReportDetailShellProps {
  report: Report;
  grant: Grant;
  requirements: Requirement[];
  members: OrgMember[];
  activities: ActivityLog[];
  userRole: string;
}

const TYPE_ICONS: Record<string, any> = {
  document: FolderOpen,
  metric: TrendingUp,
  narrative: FileText,
  financial: Calendar,
};

export function ReportDetailShell({
  report,
  grant,
  requirements,
  members,
  activities,
  userRole,
}: ReportDetailShellProps) {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [evidenceRequirement, setEvidenceRequirement] = useState<Requirement | null>(null);
  const [narrative, setNarrative] = useState(report.narrative || "");
  const [notes, setNotes] = useState(report.notes || "");
  const [isSavingNotes, startSaveNotes] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [isActionPending, startAction] = useTransition();

  const readiness = calculateReadiness(requirements);

  const handleSaveNotes = () => {
    startSaveNotes(async () => {
      const res = await updateReportAction(report.id, { narrative, notes });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to save notes");
      }
    });
  };

  const handleSubmitReport = () => {
    if (!confirm("Are you sure you want to mark this report as submitted to the funder?")) {
      return;
    }
    startSubmit(async () => {
      const res = await submitReportAction(report.id);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to submit report");
      }
    });
  };

  const handleVerify = (reqId: string) => {
    startAction(async () => {
      const res = await verifyRequirementAction(reqId);
      if (res.success) router.refresh();
      else alert(res.error || "Failed to verify requirement");
    });
  };

  const handleUnverify = (reqId: string) => {
    startAction(async () => {
      const res = await unverifyRequirementAction(reqId);
      if (res.success) router.refresh();
      else alert(res.error || "Failed to unverify requirement");
    });
  };

  const handleDeleteRequirement = (reqId: string, title: string) => {
    if (!confirm(`Delete requirement "${title}"?`)) return;
    startAction(async () => {
      const res = await deleteRequirementAction(reqId);
      if (res.success) router.refresh();
      else alert(res.error || "Failed to delete requirement");
    });
  };

  const handleStatusToggle = (req: Requirement) => {
    if (req.status === "verified" && userRole !== "admin") {
      alert("Only admins can change verified requirements.");
      return;
    }

    const nextStatus = req.status === "open" ? "provided" : req.status === "provided" ? "open" : "provided";
    startAction(async () => {
      const res = await updateRequirementAction(req.id, { status: nextStatus });
      if (res.success) router.refresh();
      else alert(res.error || "Failed to update status");
    });
  };

  const defaultItemDueDate = (() => {
    const reportDue = new Date(report.dueDate);
    reportDue.setDate(reportDue.getDate() - 7);
    return reportDue.toISOString().split("T")[0];
  })();

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/app/grants/${grant.id}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Back to Grant"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Link href={`/app/grants/${grant.id}`} className="hover:text-foreground hover:underline">
                {grant.funderName}
              </Link>
              <span>/</span>
              <span className="capitalize">{report.reportType} Report</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {report.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              report.status === "submitted"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : report.status === "approved"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            {report.status}
          </span>

          {report.status === "draft" && (
            <button
              onClick={handleSubmitReport}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Mark as Submitted
            </button>
          )}
        </div>
      </div>

      {/* Due Date & Readiness Progress Overview Card */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="h-4 w-4 text-amber-500" />
            Report Due Date
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">{report.dueDate}</p>
          {report.periodStart && report.periodEnd && (
            <p className="mt-1 text-xs text-muted-foreground">
              Period: {report.periodStart} → {report.periodEnd}
            </p>
          )}
        </div>

        <div className="sm:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Readiness Score
            </div>
            <span className="text-sm font-bold text-foreground">
              {readiness.percentage}% Complete
            </span>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${readiness.percentage}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {readiness.provided + readiness.verified} of {readiness.total} items completed
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {readiness.verified} Verified
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {readiness.provided} Provided
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {readiness.open} Open
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Checklist Section */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Reporting Requirements</h2>
            <p className="text-xs text-muted-foreground">
              Checklist of narratives, metrics, and documentation required for this grant report.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Add Requirement
          </button>
        </div>

        {requirements.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 text-base font-semibold text-foreground">No requirements added yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Break down this report into required deliverables such as board minutes, narrative drafts, or expense reports.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              Add First Requirement
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {requirements.map((req) => {
              const Icon = TYPE_ICONS[req.requirementType] || FolderOpen;
              const assignee = members.find((m) => m.id === req.assigneeUserId);

              return (
                <div
                  key={req.id}
                  className="flex flex-col items-start justify-between gap-4 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleStatusToggle(req)}
                      disabled={isActionPending}
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        req.status === "verified"
                          ? "border-blue-600 bg-blue-600 text-white"
                          : req.status === "provided"
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-muted-foreground/40 hover:border-emerald-500"
                      }`}
                      title={`Current status: ${req.status}. Click to cycle.`}
                    >
                      {req.status === "verified" && <ShieldCheck className="h-3.5 w-3.5" />}
                      {req.status === "provided" && <Check className="h-3.5 w-3.5" />}
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{req.title}</span>
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                          <Icon className="h-3 w-3" />
                          {req.requirementType}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            req.status === "verified"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : req.status === "provided"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      {req.description && (
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {assignee && (
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-3.5 w-3.5" />
                            {assignee.name}
                          </span>
                        )}
                        {req.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Due: {req.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Evidence Upload Button */}
                    <button
                      onClick={() => setEvidenceRequirement(req)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Upload evidence"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Evidence
                    </button>

                    {/* Admin Verify Button (D-007) */}
                    {userRole === "admin" && (
                      <>
                        {req.status === "verified" ? (
                          <button
                            onClick={() => handleUnverify(req.id)}
                            disabled={isActionPending}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            Unverify
                          </button>
                        ) : (
                          <button
                            onClick={() => handleVerify(req.id)}
                            disabled={isActionPending}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-400"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verify (Admin)
                          </button>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => setEditingRequirement(req)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRequirement(req.id, req.title)}
                      disabled={isActionPending}
                      className="rounded-md p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Narrative & Notes Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Draft Narrative</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Compose report summary, project highlights, and narrative responses for the funder.
          </p>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={6}
            placeholder="Enter grant report narrative..."
            className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSavingNotes ? "Saving..." : "Save Narrative"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Internal Notes</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Internal team coordination, questions for the program officer, or submission links.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Add internal notes for your team..."
            className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSavingNotes ? "Saving..." : "Save Notes"}
            </button>
          </div>
        </div>
      </div>

      {/* Add Requirement Modal */}
      {showAddModal && (
        <RequirementFormModal
          reportId={report.id}
          defaultDueDate={defaultItemDueDate}
          members={members}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Requirement Modal */}
      {editingRequirement && (
        <RequirementFormModal
          reportId={report.id}
          initialRequirement={editingRequirement}
          defaultDueDate={defaultItemDueDate}
          members={members}
          onClose={() => setEditingRequirement(null)}
        />
      )}

      {/* Evidence Modal */}
      {evidenceRequirement && (
        <EvidenceModal
          requirementId={evidenceRequirement.id}
          requirementTitle={evidenceRequirement.title}
          onClose={() => setEvidenceRequirement(null)}
          onEvidenceChange={() => router.refresh()}
        />
      )}
    </div>
  );
}

function RequirementFormModal({
  reportId,
  initialRequirement,
  defaultDueDate,
  members,
  onClose,
}: {
  reportId: string;
  initialRequirement?: Requirement;
  defaultDueDate: string;
  members: OrgMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    const payload = {
      reportId,
      title: (formData.get("title") as string).trim(),
      description: (formData.get("description") as string)?.trim() || null,
      requirementType: formData.get("requirementType") as any,
      status: (formData.get("status") as any) || "open",
      assigneeUserId: (formData.get("assigneeUserId") as string) || null,
      dueDate: (formData.get("dueDate") as string) || null,
    };

    startTransition(async () => {
      const res = initialRequirement
        ? await updateRequirementAction(initialRequirement.id, payload)
        : await createRequirementAction(payload);

      if (res.success) {
        onClose();
        router.refresh();
      } else {
        setError(res.error || "Failed to save requirement");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-foreground">
          {initialRequirement ? "Edit Requirement" : "Add Reporting Requirement"}
        </h3>
        {error && (
          <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase text-muted-foreground">Title</label>
            <input
              name="title"
              defaultValue={initialRequirement?.title || ""}
              placeholder="e.g. Q3 Financial Expenditure Report"
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Type</label>
              <select
                name="requirementType"
                defaultValue={initialRequirement?.requirementType || "document"}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              >
                <option value="document">Document / PDF</option>
                <option value="financial">Financial / Budget</option>
                <option value="metric">Metric / Numbers</option>
                <option value="narrative">Narrative</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={initialRequirement?.status || "open"}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="provided">Provided</option>
                {initialRequirement?.status === "verified" && (
                  <option value="verified">Verified</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Assignee</label>
              <select
                name="assigneeUserId"
                defaultValue={initialRequirement?.assigneeUserId || ""}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-muted-foreground">Internal Due Date</label>
              <input
                name="dueDate"
                type="date"
                defaultValue={initialRequirement?.dueDate || defaultDueDate}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase text-muted-foreground">Description / Guidelines</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={initialRequirement?.description || ""}
              placeholder="Instructions or specific questions for the assignee..."
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
              {isPending ? "Saving..." : "Save Requirement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
