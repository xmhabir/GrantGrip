import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center">
      <Suspense
        fallback={
          <div className="flex h-96 w-full items-center justify-center rounded-2xl border border-border glass-panel">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        }
      >
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-xl border border-border rounded-2xl glass-panel",
              primaryButton: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
            },
          }}
        />
      </Suspense>
    </div>
  );
}
