"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import {
  listReminderRules,
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
  ensureDefaultReminderRules,
} from "@/lib/repositories/reminderRules";
import { processHourlyReminders } from "@/lib/services/reminders";

const RuleSchema = z.object({
  name: z.string().min(1).max(100),
  daysBefore: z.number().int().min(0).max(365),
  channels: z.array(z.string()).default(["email"]),
  appliesTo: z.enum(["reports", "requirements", "all"]).default("all"),
  isEnabled: z.boolean().default(true),
});

export async function listReminderRulesAction() {
  try {
    const { orgId } = await requireOrgRole("member");
    let rules = await listReminderRules(orgId);
    if (rules.length === 0) {
      rules = await ensureDefaultReminderRules(orgId);
    }
    return { success: true, data: rules };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to load reminder rules" };
  }
}

export async function createReminderRuleAction(formData: unknown) {
  try {
    const { orgId } = await requireOrgRole("admin");
    const parsed = RuleSchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: "Invalid reminder rule data", details: parsed.error.flatten() };
    }

    const created = await createReminderRule(orgId, parsed.data);
    revalidatePath("/app/settings");
    return { success: true, data: created };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create reminder rule" };
  }
}

export async function updateReminderRuleAction(ruleId: string, formData: unknown) {
  try {
    const { orgId } = await requireOrgRole("admin");
    const parsed = RuleSchema.partial().safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: "Invalid update data", details: parsed.error.flatten() };
    }

    const updated = await updateReminderRule(orgId, ruleId, parsed.data);
    revalidatePath("/app/settings");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update reminder rule" };
  }
}

export async function deleteReminderRuleAction(ruleId: string) {
  try {
    const { orgId } = await requireOrgRole("admin");
    const deleted = await deleteReminderRule(orgId, ruleId);
    revalidatePath("/app/settings");
    return { success: true, data: deleted };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to delete reminder rule" };
  }
}

export async function triggerManualRemindersAction() {
  try {
    const { orgId } = await requireOrgRole("admin");
    const summary = await processHourlyReminders(new Date(), { forceOrgId: orgId });
    return { success: true, data: summary };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to trigger reminders" };
  }
}
