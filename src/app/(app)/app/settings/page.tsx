import { requireOrgRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listReminderRules, ensureDefaultReminderRules } from "@/lib/repositories/reminderRules";
import { ReminderSettingsShell } from "@/components/settings/ReminderSettingsShell";

export const metadata = {
  title: "Settings & Team — GrantGrip",
  description: "Configure deadline reminders, notification channels, and workspace settings.",
};

export default async function SettingsPage() {
  const { orgId, role } = await requireOrgRole("member");

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  let rules = await listReminderRules(orgId);
  if (rules.length === 0) {
    rules = await ensureDefaultReminderRules(orgId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage automated notifications, reminder frequency, and organization preferences.
        </p>
      </div>

      <ReminderSettingsShell
        initialRules={rules}
        orgName={org?.name || "Your Organization"}
        userRole={role}
      />
    </div>
  );
}
