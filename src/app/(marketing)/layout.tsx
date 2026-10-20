import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-border">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="bg-gradient-to-r from-emerald-600 to-teal-800 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-200">
              GrantGrip
            </span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all glow-emerald"
            >
              Sign In
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-8 text-center text-xs text-muted-foreground">
        <div className="container mx-auto px-4">
          <p>© 2026 GrantGrip Inc. Built for mission-driven US nonprofits.</p>
          <p className="mt-1">SOC 2 compliant multi-tenant grant reporting workspace.</p>
        </div>
      </footer>
    </div>
  );
}
