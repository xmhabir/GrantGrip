import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <Link href="/" className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-emerald-600 to-teal-800 bg-clip-text text-transparent">
          GrantGrip
        </Link>
      </div>

      <div className="w-full max-w-md">
        {children}
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground">
        Secure, multi-tenant post-award grant workspace for nonprofits.
      </div>
    </div>
  );
}
