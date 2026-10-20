"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Award, CalendarCheck2, FolderLock, Settings } from "lucide-react";

const navItems = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/grants", label: "Grants", icon: Award, exact: false },
  { href: "/app/reports", label: "Reports & Deadlines", icon: CalendarCheck2, exact: false },
  { href: "/app/evidence", label: "Compliance Vault", icon: FolderLock, exact: false },
  { href: "/app/settings", label: "Settings & Team", icon: Settings, exact: false },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-4" aria-label="Main navigation">
      {navItems.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "text-emerald-600 bg-emerald-500/10"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            {isActive && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
