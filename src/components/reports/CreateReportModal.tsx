"use client";

import { useTransition, useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { createReportAction } from "@/lib/actions/reports";
import { reportTypeValues, reportStatusValues } from "@/lib/validations/reports";
import type { Grant } from "@/lib/db/schema";

interface CreateReportModalProps {
  grants: Grant[];
  defaultGrantId?: string;
  onClose: () => void;
  onSuccess?: (reportId: string) => void;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  progress: "Progress Report",
  financial: "Financial Report",
  final: "Final Report",
  other: "Other",
};

export function CreateReportModal({
  grants,
  defaultGrantId,
  onClose,
  onSuccess,
}: CreateReportModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const input = {
      grantId: fd.get("grantId") as string,
      title: fd.get("title") as string,
      reportType: fd.get("reportType") as string,
      dueDate: fd.get("dueDate") as string,
      periodStart: (fd.get("periodStart") as string) || undefined,
      periodEnd: (fd.get("periodEnd") as string) || undefined,
      status: "draft" as const,
      notes: (fd.get("notes") as string) || undefined,
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const result = await createReportAction(input);
      if (result.success && result.data) {
        onSuccess?.(result.data.id);
        onClose();
      } else {
        setError(result.error ?? "Something went wrong");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  }

  function fieldErr(name: string) {
    return fieldErrors[name]?.[0];
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-report-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="create-report-modal-title" className="text-base font-semibold text-foreground">
            Add Report Deadline
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Grant selector */}
          <div className="space-y-1.5">
            <label htmlFor="rpt-grantId" className="text-sm font-medium text-foreground">
              Grant <span className="text-red-500">*</span>
            </label>
            {grants.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-3">
                No grants found. Add a grant first before creating reports.
              </p>
            ) : (
              <select
                id="rpt-grantId"
                name="grantId"
                required
                defaultValue={defaultGrantId ?? ""}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow ${
                  fieldErr("grantId") ? "border-red-500" : "border-border"
                }`}
              >
                <option value="" disabled>
                  Select a grant…
                </option>
                {grants.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.funderName}
                    {g.opportunityNumber ? ` (#${g.opportunityNumber})` : ""}
                  </option>
                ))}
              </select>
            )}
            {fieldErr("grantId") && (
              <p className="text-xs text-red-500">{fieldErr("grantId")}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="rpt-title" className="text-sm font-medium text-foreground">
              Report Title <span className="text-red-500">*</span>
            </label>
            <input
              id="rpt-title"
              name="title"
              type="text"
              required
              placeholder="e.g. Q1 Progress Report 2025"
              className={`w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow ${
                fieldErr("title") ? "border-red-500" : "border-border"
              }`}
            />
            {fieldErr("title") && <p className="text-xs text-red-500">{fieldErr("title")}</p>}
          </div>

          {/* Type + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="rpt-reportType" className="text-sm font-medium text-foreground">
                Report Type <span className="text-red-500">*</span>
              </label>
              <select
                id="rpt-reportType"
                name="reportType"
                required
                defaultValue="progress"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
              >
                {reportTypeValues.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rpt-dueDate" className="text-sm font-medium text-foreground">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                id="rpt-dueDate"
                name="dueDate"
                type="date"
                required
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow ${
                  fieldErr("dueDate") ? "border-red-500" : "border-border"
                }`}
              />
              {fieldErr("dueDate") && (
                <p className="text-xs text-red-500">{fieldErr("dueDate")}</p>
              )}
            </div>
          </div>

          {/* Period dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="rpt-periodStart" className="text-sm font-medium text-foreground">
                Period Start
              </label>
              <input
                id="rpt-periodStart"
                name="periodStart"
                type="date"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rpt-periodEnd" className="text-sm font-medium text-foreground">
                Period End
              </label>
              <input
                id="rpt-periodEnd"
                name="periodEnd"
                type="date"
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow ${
                  fieldErr("periodEnd") ? "border-red-500" : "border-border"
                }`}
              />
              {fieldErr("periodEnd") && (
                <p className="text-xs text-red-500">{fieldErr("periodEnd")}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label htmlFor="rpt-notes" className="text-sm font-medium text-foreground">
              Notes
            </label>
            <textarea
              id="rpt-notes"
              name="notes"
              rows={2}
              placeholder="Funder contact, submission portal URL…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || grants.length === 0}
              id="rpt-create-submit"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add Deadline"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
