"use client";

import { useTransition, useRef, useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { createGrantAction } from "@/lib/actions/grants";
import { grantStatusValues, dollarsToCents } from "@/lib/validations/grants";

interface CreateGrantModalProps {
  onClose: () => void;
  onSuccess?: (grantId: string) => void;
}

export function CreateGrantModal({ onClose, onSuccess }: CreateGrantModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const awardRaw = fd.get("awardAmount") as string;

    const input = {
      funderName: fd.get("funderName") as string,
      opportunityNumber: (fd.get("opportunityNumber") as string) || undefined,
      awardAmountCents: awardRaw ? dollarsToCents(awardRaw) : undefined,
      currency: "USD",
      startDate: (fd.get("startDate") as string) || undefined,
      endDate: (fd.get("endDate") as string) || undefined,
      status: (fd.get("status") as string) || "active",
      programArea: (fd.get("programArea") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const result = await createGrantAction(input);
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
      aria-labelledby="create-grant-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="create-grant-modal-title" className="text-base font-semibold text-foreground">
            Add New Grant
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

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Funder Name */}
          <div className="space-y-1.5">
            <label htmlFor="gg-funderName" className="text-sm font-medium text-foreground">
              Funder Name <span className="text-red-500">*</span>
            </label>
            <input
              id="gg-funderName"
              name="funderName"
              type="text"
              required
              placeholder="e.g. Robert Wood Johnson Foundation"
              className={`w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow ${
                fieldErr("funderName") ? "border-red-500" : "border-border"
              }`}
            />
            {fieldErr("funderName") && (
              <p className="text-xs text-red-500">{fieldErr("funderName")}</p>
            )}
          </div>

          {/* Opportunity Number */}
          <div className="space-y-1.5">
            <label htmlFor="gg-opportunityNumber" className="text-sm font-medium text-foreground">
              Opportunity / Grant Number
            </label>
            <input
              id="gg-opportunityNumber"
              name="opportunityNumber"
              type="text"
              placeholder="e.g. RFA-2024-001"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
            />
          </div>

          {/* Award Amount + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="gg-awardAmount" className="text-sm font-medium text-foreground">
                Award Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  id="gg-awardAmount"
                  name="awardAmount"
                  type="text"
                  inputMode="decimal"
                  placeholder="50,000"
                  className="w-full rounded-lg border border-border bg-background pl-6 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="gg-status" className="text-sm font-medium text-foreground">
                Status
              </label>
              <select
                id="gg-status"
                name="status"
                defaultValue="active"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow capitalize"
              >
                {grantStatusValues.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="gg-startDate" className="text-sm font-medium text-foreground">
                Grant Start Date
              </label>
              <input
                id="gg-startDate"
                name="startDate"
                type="date"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="gg-endDate" className="text-sm font-medium text-foreground">
                Grant End Date
              </label>
              <input
                id="gg-endDate"
                name="endDate"
                type="date"
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow ${
                  fieldErr("endDate") ? "border-red-500" : "border-border"
                }`}
              />
              {fieldErr("endDate") && (
                <p className="text-xs text-red-500">{fieldErr("endDate")}</p>
              )}
            </div>
          </div>

          {/* Program Area */}
          <div className="space-y-1.5">
            <label htmlFor="gg-programArea" className="text-sm font-medium text-foreground">
              Program Area
            </label>
            <input
              id="gg-programArea"
              name="programArea"
              type="text"
              placeholder="e.g. Youth Education, Community Health"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label htmlFor="gg-notes" className="text-sm font-medium text-foreground">
              Notes
            </label>
            <textarea
              id="gg-notes"
              name="notes"
              rows={3}
              placeholder="Internal notes about this grant…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow resize-none"
            />
          </div>

          {/* Actions */}
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
              disabled={isPending}
              id="gg-create-grant-submit"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add Grant"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
