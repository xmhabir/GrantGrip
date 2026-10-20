import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/app(.*)"]);
const isSelectOrgRoute = createRouteMatcher(["/select-org(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId } = await auth();

  if (isProtectedRoute(req)) {
    if (!userId) {
      await auth.protect();
      return;
    }

    if (!orgId) {
      const selectOrgUrl = new URL("/select-org", req.url);
      return NextResponse.redirect(selectOrgUrl);
    }
  }

  if (isSelectOrgRoute(req)) {
    if (!userId) {
      await auth.protect();
      return;
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
