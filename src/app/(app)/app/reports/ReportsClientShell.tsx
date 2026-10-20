"use client";

import { useState, useMemo, useTransition } from "react";
import { Plus, Search, CalendarDays, AlertTriangle, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { CreateReportModal } from "@/components/reports/CreateReportModal";
import { submitReportAction, deleteReportAction } from "@/lib/actions/reports";
import type { Report, Grant } from "@/lib/db/schema";

interface ReportsClientShellProps {
  initialReports: Report[];
  grants: Grant[];
}

type StatusFilter = "all" | "overdue" | "upcoming" | "draft" | "submitted" | "approved";

const REPORT_TYPE_LABELS: Record<string, string> = {
  progress: "Progress",
  financial: "Financial",
  final: "Final",
  other: "Other",
};

function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function DueDateBadge({ dueDate, status }: { dueDate: string; status: string }) {
  if (status === "submitted" || status === "approved") return null;
  const days = getDaysUntilDue(dueDate);

  if (days < 0) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {Math.abs(days)}d overdue
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        Due in {days}d
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
        <CalendarDays className="h-3 w-3" />
        Due in {days}d
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CalendarDays className="h-3 w-3" />
      {new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "submitted") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
        <CheckCircle2 className="h-3 w-3" />
        Submitted
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Approved
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Draft
    </span>
  );
}

function ReportRow({
  report,
  grantName,
}: {
  report: Report;
  grantName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const days = getDaysUntilDue(report.dueDate);
  const isOverdue = days < 0 && report.status === "draft";

  return (
    <div
      className={`group flex flex-col gap-3 rounded-xl border bg-card/80 hover:bg-card transition-all duration-200 p-4 sm:flex-row sm:items-center sm:gap-4 ${
        isOverdue ? "border-red-500/30 hover:border-red-500/50" : "border-border hover:border-emerald-500/20"
      }`}
      id={`report-row-${report.id}`}
    >
      {/* Left: urgency stripe */}
      <div
        className={`hidden sm:block w-1 self-stretch rounded-full shrink-0 ${
          isOverdue
            ? "bg-red-500"
            : days <= 7 && report.status === "draft"
            ? "bg-amber-500"
            : days <= 30 && report.status === "draft"
            ? "bg-blue-500"
            : "bg-muted"
        }`}
      />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {REPORT_TYPE_LABELS[report.reportType] ?? report.reportType}
          </span>
          <StatusBadge status={report.status} />
        </div>
        <h3 className="mt-1.5 font-semibold text-foreground truncate" title={report.title}>
          {report.title}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{grantName}</p>
      </div>

      {/* Due date */}
      <div className="flex items-center gap-3 shrink-0">
        <DueDateBadge dueDate={report.dueDate} status={report.status} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {report.status === "draft" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await submitReportAction(report.id);
              })
            }
            id={`report-submit-${report.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-60 transition-colors dark:text-emerald-400"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Mark Submitted
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            startTransition(async () => {
              await deleteReportAction(report.id);
            });
          }}
          id={`report-delete-${report.id}`}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
            confirmDelete
              ? "bg-red-600 text-white hover:bg-red-700"
              : "text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
          }`}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? "Confirm?" : "Delete"}
        </button>
      </div>
    </div>
  );
}

export function ReportsClientShell({ initialReports, grants }: ReportsClientShellProps) {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const grantsById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of grants) map[g.id] = g.funderName;
    return map;
  }, [grants]);

  const filtered = useMemo(() => {
    return initialReports.filter((r) => {
      const grantName = grantsById[r.grantId] ?? "";
      const matchesSearch =
        !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        grantName.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;
      if (statusFilter === "overdue") {
        return r.status === "draft" && getDaysUntilDue(r.dueDate) < 0;
      }
      if (statusFilter === "upcoming") {
        const d = getDaysUntilDue(r.dueDate);
        return r.status === "draft" && d >= 0 && d <= 30;
      }
      return r.status === statusFilter;
    });
  }, [initialReports, search, statusFilter, grantsById]);

  const counts = useMemo(() => {
    const overdue = initialReports.filter(
      (r) => r.status === "draft" && getDaysUntilDue(r.dueDate) < 0
    ).length;
    const upcoming = initialReports.filter((r) => {
      const d = getDaysUntilDue(r.dueDate);
      return r.status === "draft" && d >= 0 && d <= 30;
    }).length;
    return {
      all: initialReports.length,
      overdue,
      upcoming,
      draft: initialReports.filter((r) => r.status === "draft").length,
      submitted: initialReports.filter((r) => r.status === "submitted").length,
      approved: initialReports.filter((r) => r.status === "approved").length,
    };
  }, [initialReports]);

  const filterOptions: { key: StatusFilter; label: string; urgent?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "overdue", label: "Overdue", urgent: true },
    { key: "upcoming", label: "Next 30 days" },
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "approved", label: "Approved" },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports & Deadlines</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {counts.overdue > 0 && (
              <span className="font-semibold text-red-500 mr-2">
                ⚠ {counts.overdue} overdue
              </span>
            )}
            {counts.upcoming} due in next 30 days · {counts.all} total
          </p>
        </div>
        <button
          type="button"
          id="reports-add-btn"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
        >
          <Plus className="h-4 w-4" />
          Add Deadline
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="reports-search"
            type="search"
            placeholder="Search reports or grants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {filterOptions.map(({ key, label, urgent }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === key
                  ? urgent && counts.overdue > 0
                    ? "bg-red-600 text-white shadow-sm"
                    : "bg-card text-foreground shadow-sm"
                  : urgent && counts.overdue > 0
                  ? "text-red-600 hover:bg-red-500/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}{" "}
              <span className="ml-1 tabular-nums opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Report list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <CalendarDays className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {initialReports.length > 0 ? "No reports match your filters" : "No report deadlines yet"}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {initialReports.length > 0
              ? "Try a different filter or search term."
              : "Add your first report deadline to start tracking submissions."}
          </p>
          {initialReports.length === 0 && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              id="reports-empty-add-btn"
              className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add first deadline
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              grantName={grantsById[report.grantId] ?? "Unknown grant"}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateReportModal
          grants={grants}
          onClose={() => setShowModal(false)}
          onSuccess={() => setShowModal(false)}
        />
      )}
    </>
  );
}
