import Link from "next/link";
import {
  CheckCircle2,
  Calendar,
  FileCheck2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function MarketingPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden px-4 pt-20 pb-28 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 backdrop-blur-md mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Built for Small US Nonprofits (5–30 Active Grants)</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            Everything needed to report on a grant,{" "}
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 bg-clip-text text-transparent">
              in one place.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
            No missed deadlines. No missing documents. Never scramble through messy email threads
            or lose compliance receipts before funder submissions.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition-all glow-emerald hover:-translate-y-0.5"
            >
              Enter Workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-6 py-3.5 text-base font-medium text-foreground hover:bg-card transition-all hover:-translate-y-0.5 backdrop-blur-sm"
            >
              View Non-Profit Plans
            </Link>
          </div>

          {/* Social Proof Metric Pill */}
          <div className="mt-12 flex flex-wrap justify-center items-center gap-8 text-xs font-medium text-muted-foreground border-y border-border/60 py-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Multi-Tenant SOC 2 Guardrails</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Zero-Retention Claude AI Extraction</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Org-Timezone 9 AM Reminders</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="w-full bg-card/40 border-t border-border py-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              A Purpose-Built Post-Award Compliance Engine
            </h2>
            <p className="mt-3 text-muted-foreground text-sm max-w-xl mx-auto">
              Grant discovery tools stop when you get the check. GrantGrip starts right there to
              guarantee you stay funded year after year.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 mb-5">
                <Calendar className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">Never Miss a Report</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Automated reminders sent at 9:00 AM in your nonprofit&apos;s local timezone at 30, 14,
                and 7 days before due dates.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 mb-5">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">Centralized Evidence Vault</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Attach receipts, sign-in sheets, and photos directly to each report requirement. One-click
                readiness percentage tracking.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 mb-5">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">AI Requirement Extraction</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Upload 30-page grant agreements. Claude automatically extracts milestones and deliverables
                into verified compliance items.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
