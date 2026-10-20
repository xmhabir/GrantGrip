"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Calendar,
  DollarSign,
  Trash2,
  ExternalLink,
  MoreHorizontal,
  CheckCircle,
  Clock,
  Archive,
  Loader2,
} from "lucide-react";
import { deleteGrantAction } from "@/lib/actions/grants";
import type { Grant } from "@/lib/db/schema";

interface GrantCardProps {
  grant: Grant;
}

const STATUS_CONFIG = {
  active: {
    label: "Active",
    icon: CheckCircle,
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  completed: {
    label: "Completed",
    icon: Clock,
    classes: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    dot: "bg-blue-500",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    classes: "bg-muted/50 text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};

export function GrantCard({ grant }: GrantCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = STATUS_CONFIG[grant.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active;
  const StatusIcon = status.icon;

  const awardDisplay = grant.awardAmountCents
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: grant.currency || "USD",
        maximumFractionDigits: 0,
      }).format(grant.awardAmountCents / 100)
    : null;

  const endDate = grant.endDate
    ? new Date(grant.endDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      await deleteGrantAction(grant.id);
      setMenuOpen(false);
    });
  }

  return (
    <div
      className="group relative rounded-xl border border-border bg-card/80 hover:bg-card hover:border-emerald-500/30 hover:shadow-md transition-all duration-200 p-5"
      id={`grant-card-${grant.id}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <Award className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3
              className="font-semibold text-foreground leading-snug truncate cursor-pointer hover:text-emerald-600 transition-colors"
              onClick={() => router.push(`/app/grants/${grant.id}`)}
              title={grant.funderName}
            >
              {grant.funderName}
            </h3>
            {grant.opportunityNumber && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                #{grant.opportunityNumber}
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.classes}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        {awardDisplay && (
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            {awardDisplay}
          </span>
        )}
        {endDate && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Ends {endDate}
          </span>
        )}
        {grant.programArea && (
          <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
            {grant.programArea}
          </span>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={() => router.push(`/app/grants/${grant.id}`)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-emerald-600 transition-colors"
          id={`grant-view-${grant.id}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View details
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setMenuOpen((o) => !o);
              setConfirmDelete(false);
            }}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Grant options"
            id={`grant-menu-${grant.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(false);
                }}
                aria-hidden="true"
              />
              <div className="absolute right-0 bottom-full mb-1 z-20 min-w-[160px] rounded-xl border border-border bg-popover shadow-lg p-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(`/app/grants/${grant.id}`);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open grant
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                    confirmDelete
                      ? "text-white bg-red-600 hover:bg-red-700"
                      : "text-red-600 hover:bg-red-500/10"
                  }`}
                  id={`grant-delete-${grant.id}`}
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {confirmDelete ? "Confirm delete" : "Archive grant"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
