"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Building2 } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console or error reporter
    console.error("Application error boundary triggered:", error);
  }, [error]);

  const isOrgError =
    error.name === "OrganizationRequiredError" ||
    error.message?.includes("Active organization required") ||
    error.message?.toLowerCase().includes("organization");

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 mb-6">
        {isOrgError ? <Building2 className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {isOrgError ? "Active Organization Required" : "Something went wrong"}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {isOrgError
          ? "Please select or create an organization to access your GrantGrip workspace."
          : "An unexpected error occurred while loading this view. Our team has been notified."}
      </p>
      {error?.message && !isOrgError && (
        <pre className="mt-4 max-w-lg overflow-x-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
      <div className="mt-6 flex items-center gap-3">
        {isOrgError ? (
          <Link
            href="/select-org"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Select or Create Organization
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
