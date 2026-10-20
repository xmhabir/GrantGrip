import { NextRequest, NextResponse } from "next/server";
import { processHourlyReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

/**
 * Hourly cron trigger for deadline reminders and weekly admin digest.
 * Compatible with Vercel Cron (`0 * * * *`), Inngest, or external scheduler.
 */
export async function GET(req: NextRequest) {
  try {
    // Optional secret check if CRON_SECRET is set
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await processHourlyReminders();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
    });
  } catch (error: any) {
    console.error("[reminders/run] Error processing reminders:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
