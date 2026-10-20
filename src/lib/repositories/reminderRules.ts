import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reminderRules, reminderLog, organizations, reports, requirements, users, memberships } from "@/lib/db/schema";

export interface CreateReminderRuleInput {
  name: string;
  daysBefore: number;
  channels?: string[];
  appliesTo?: "reports" | "requirements" | "all";
  isEnabled?: boolean;
}

export interface UpdateReminderRuleInput {
  name?: string;
  daysBefore?: number;
  channels?: string[];
  appliesTo?: "reports" | "requirements" | "all";
  isEnabled?: boolean;
}

/**
 * Lists all reminder rules for a specific tenant organization.
 */
export async function listReminderRules(orgId: string) {
  return await db.query.reminderRules.findMany({
    where: eq(reminderRules.organizationId, orgId),
    orderBy: [desc(reminderRules.daysBefore)],
  });
}

/**
 * Gets a specific reminder rule by ID scoped to tenant organization.
 */
export async function getReminderRuleById(orgId: string, ruleId: string) {
  return await db.query.reminderRules.findFirst({
    where: and(
      eq(reminderRules.id, ruleId),
      eq(reminderRules.organizationId, orgId)
    ),
  });
}

/**
 * Creates a reminder rule scoped to tenant organization.
 */
export async function createReminderRule(orgId: string, input: CreateReminderRuleInput) {
  const [created] = await db
    .insert(reminderRules)
    .values({
      organizationId: orgId,
      name: input.name,
      daysBefore: input.daysBefore,
      channels: input.channels ?? ["email"],
      appliesTo: input.appliesTo ?? "all",
      isEnabled: input.isEnabled ?? true,
    })
    .returning();

  return created;
}

/**
 * Updates an existing reminder rule scoped to tenant organization.
 */
export async function updateReminderRule(
  orgId: string,
  ruleId: string,
  input: UpdateReminderRuleInput
) {
  const [updated] = await db
    .update(reminderRules)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reminderRules.id, ruleId),
        eq(reminderRules.organizationId, orgId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Reminder rule not found or access denied.");
  }

  return updated;
}

/**
 * Deletes a reminder rule scoped to tenant organization.
 */
export async function deleteReminderRule(orgId: string, ruleId: string) {
  const [deleted] = await db
    .delete(reminderRules)
    .where(
      and(
        eq(reminderRules.id, ruleId),
        eq(reminderRules.organizationId, orgId)
      )
    )
    .returning();

  if (!deleted) {
    throw new Error("Reminder rule not found or access denied.");
  }

  return deleted;
}

/**
 * Ensures default reminder rules exist for an organization (30, 14, 7, 1 days).
 */
export async function ensureDefaultReminderRules(orgId: string) {
  const existing = await listReminderRules(orgId);
  if (existing.length > 0) return existing;

  const defaults: CreateReminderRuleInput[] = [
    { name: "30 Days Before Deadline", daysBefore: 30, appliesTo: "all", channels: ["email"], isEnabled: true },
    { name: "14 Days Before Deadline", daysBefore: 14, appliesTo: "all", channels: ["email"], isEnabled: true },
    { name: "7 Days Before Deadline", daysBefore: 7, appliesTo: "all", channels: ["email"], isEnabled: true },
    { name: "1 Day Before Deadline", daysBefore: 1, appliesTo: "all", channels: ["email"], isEnabled: true },
  ];

  const results = [];
  for (const item of defaults) {
    const created = await createReminderRule(orgId, item);
    results.push(created);
  }
  return results;
}

// ============================================================================
// D-002: TIMEZONE & LOCAL DATE COMPUTATION HELPERS
// ============================================================================

/**
 * Formats a Date object in a target IANA timezone as `YYYY-MM-DD`.
 */
export function getLocalDateString(timezone: string, dateUtc: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(dateUtc); // Returns "YYYY-MM-DD"
  } catch {
    // Fallback if timezone string is invalid
    return dateUtc.toISOString().split("T")[0];
  }
}

/**
 * Computes the hour (0-23) in the target timezone for a given UTC instant.
 */
export function getLocalHourInTimezone(timezone: string, dateUtc: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const hourStr = formatter.format(dateUtc);
    return parseInt(hourStr, 10);
  } catch {
    return dateUtc.getUTCHours();
  }
}

/**
 * Checks whether the current local time in the specified timezone is within the target hour.
 * (e.g. targetHour = 9 for 09:00 local time).
 */
export function isHourInTimezone(timezone: string, targetHour: number, dateUtc: Date = new Date()): boolean {
  return getLocalHourInTimezone(timezone, dateUtc) === targetHour;
}

/**
 * Checks whether the specified instant corresponds to Monday in the target timezone.
 */
export function isMondayInTimezone(timezone: string, dateUtc: Date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "narrow",
    });
    // Or check day of week:
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(dateUtc);
    return parts.toLowerCase() === "monday";
  } catch {
    return dateUtc.getUTCDay() === 1;
  }
}

/**
 * Computes the day difference between today's local date and the target due date.
 * Returns positive if due in the future, 0 if due today, negative if overdue.
 */
export function calculateDaysDifference(todayLocalDateStr: string, dueDateStr: string): number {
  const today = new Date(`${todayLocalDateStr}T00:00:00Z`);
  const due = new Date(`${dueDateStr}T00:00:00Z`);
  const diffMs = due.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// D-001: DEDUPLICATION & LOGGING (reminder_log)
// ============================================================================

/**
 * Checks if a reminder has already been sent for the given target, user, and daysBefore window.
 */
export async function hasReminderBeenSent(
  orgId: string,
  targetType: "report" | "requirement",
  targetId: string,
  userId: string,
  daysBefore: number
): Promise<boolean> {
  const existing = await db.query.reminderLog.findFirst({
    where: and(
      eq(reminderLog.organizationId, orgId),
      eq(reminderLog.targetType, targetType),
      eq(reminderLog.targetId, targetId),
      eq(reminderLog.userId, userId),
      eq(reminderLog.daysBefore, daysBefore)
    ),
  });

  return !!existing;
}

/**
 * Records a sent reminder in reminder_log.
 * D-001: Uses ON CONFLICT DO NOTHING against the partial unique indexes.
 */
export async function logReminderSent(entry: {
  organizationId: string;
  targetType: "report" | "requirement";
  targetId: string;
  userId: string;
  daysBefore: number;
  channel?: string;
  sentAt?: Date;
}): Promise<boolean> {
  try {
    await db
      .insert(reminderLog)
      .values({
        organizationId: entry.organizationId,
        targetType: entry.targetType,
        targetId: entry.targetId,
        userId: entry.userId,
        daysBefore: entry.daysBefore,
        channel: entry.channel ?? "email",
        sentAt: entry.sentAt ?? new Date(),
      })
      .onConflictDoNothing();

    return true;
  } catch (error) {
    console.error("[reminder_log] Failed to log reminder:", error);
    return false;
  }
}
