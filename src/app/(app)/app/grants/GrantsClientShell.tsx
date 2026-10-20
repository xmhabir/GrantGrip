"use client";

import { useState, useMemo } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { GrantCard } from "@/components/grants/GrantCard";
import { CreateGrantModal } from "@/components/grants/CreateGrantModal";
import type { Grant } from "@/lib/db/schema";
import { grantStatusValues } from "@/lib/validations/grants";

interface GrantsClientShellProps {
  initialGrants: Grant[];
}

type FilterStatus = "all" | (typeof grantStatusValues)[number];

export function GrantsClientShell({ initialGrants }: GrantsClientShellProps) {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const filtered = useMemo(() => {
    return initialGrants.filter((g) => {
      const matchesSearch =
        !search ||
        g.funderName.toLowerCase().includes(search.toLowerCase()) ||
        g.programArea?.toLowerCase().includes(search.toLowerCase()) ||
        g.opportunityNumber?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "all" || g.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [initialGrants, search, statusFilter]);

  const counts = useMemo(
    () => ({
      all: initialGrants.length,
      active: initialGrants.filter((g) => g.status === "active").length,
      completed: initialGrants.filter((g) => g.status === "completed").length,
      archived: initialGrants.filter((g) => g.status === "archived").length,
    }),
    [initialGrants]
  );

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Grants</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {counts.active} active · {counts.all} total
          </p>
        </div>
        <button
          type="button"
          id="grants-add-btn"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
        >
          <Plus className="h-4 w-4" />
          Add Grant
        </button>
      </div>

      {/* Filters bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="grants-search"
            type="search"
            placeholder="Search by funder, program area…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <SlidersHorizontal className="h-3.5 w-3.5 ml-2 text-muted-foreground shrink-0" />
          {(["all", ...grantStatusValues] as FilterStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}{" "}
              <span className="ml-1 tabular-nums opacity-60">
                {s === "all" ? counts.all : counts[s as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grant grid */}
      {filtered.length === 0 ? (
        <EmptyState
          hasGrants={initialGrants.length > 0}
          onAddGrant={() => setShowModal(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((grant) => (
            <GrantCard key={grant.id} grant={grant} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <CreateGrantModal
          onClose={() => setShowModal(false)}
          onSuccess={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function EmptyState({
  hasGrants,
  onAddGrant,
}: {
  hasGrants: boolean;
  onAddGrant: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        {hasGrants ? "No grants match your filters" : "No grants yet"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasGrants
          ? "Try adjusting your search or status filter."
          : "Add your first grant to start tracking reporting deadlines and requirements."}
      </p>
      {!hasGrants && (
        <button
          type="button"
          onClick={onAddGrant}
          id="grants-empty-add-btn"
          className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add your first grant
        </button>
      )}
    </div>
  );
}
