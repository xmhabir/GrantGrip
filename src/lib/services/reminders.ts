import { eq, and, ne, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  reports,
  requirements,
  grants,
  users,
  memberships,
  reminderRules,
} from "@/lib/db/schema";
import {
  isHourInTimezone,
  isMondayInTimezone,
  getLocalDateString,
  calculateDaysDifference,
  hasReminderBeenSent,
  logReminderSent,
  ensureDefaultReminderRules,
} from "@/lib/repositories/reminderRules";
import { sendEmail } from "@/lib/email/client";
import {
  renderDueReminderEmail,
  renderWeeklyDigestEmail,
  WeeklyDigestItem,
} from "@/lib/email/templates";
import { env } from "@/lib/env";

export interface ProcessRemindersResult {
  organizationsEvaluated: number;
  organizationsProcessed: number;
  remindersSent: number;
  digestsSent: number;
  skippedDeduplicated: number;
  details: Array<{
    orgId: string;
    orgName: string;
    type: string;
    targetTitle: string;
    recipientEmail: string;
    daysBefore: number;
  }>;
}

/**
 * Hourly reminder processor complying with D-001 (deduplication) and D-002 (org-local time).
 * 
 * Logic:
 * 1. Checks each org's local time — processes only if local hour is 9 (09:00 AM) or forceOrgId is provided.
 * 2. Computes "due in N days" using the org's local date (not UTC).
 * 3. Compares against active reminder rules (e.g. 30, 14, 7, 1 days before).
 * 4. Deduplicates against reminder_log (target_id, user_id, days_before) before sending.
 * 5. If Monday in local timezone, delivers the weekly digest to org admins.
 */
export async function processHourlyReminders(
  currentUtc: Date = new Date(),
  options: { forceOrgId?: string; dryRun?: boolean } = {}
): Promise<ProcessRemindersResult> {
  const result: ProcessRemindersResult = {
    organizationsEvaluated: 0,
    organizationsProcessed: 0,
    remindersSent: 0,
    digestsSent: 0,
    skippedDeduplicated: 0,
    details: [],
  };

  // 1. Fetch all candidate organizations
  const allOrgs = await db.query.organizations.findMany();
  result.organizationsEvaluated = allOrgs.length;

  for (const org of allOrgs) {
    if (options.forceOrgId && org.id !== options.forceOrgId) {
      continue;
    }

    const orgTz = org.timezone || "America/New_York";

    // D-002: Process only organizations whose local hour is 9 (unless forced)
    if (!options.forceOrgId && !isHourInTimezone(orgTz, 9, currentUtc)) {
      continue;
    }

    result.organizationsProcessed++;
    const localDateStr = getLocalDateString(orgTz, currentUtc);
    const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Load active reminder rules (or seed defaults if empty)
    let rules = await db.query.reminderRules.findMany({
      where: and(
        eq(reminderRules.organizationId, org.id),
        eq(reminderRules.isEnabled, true)
      ),
    });

    if (rules.length === 0) {
      rules = await ensureDefaultReminderRules(org.id);
    }

    const activeDaysBeforeSet = new Set(rules.map((r) => r.daysBefore));

    // Load org members (admins & assignees)
    const orgMembers = await db.query.memberships.findMany({
      where: eq(memberships.organizationId, org.id),
      with: {
        // user relation
      },
    });

    // Helper to get user email by internal UUID
    const userMap = new Map<string, { email: string; name: string; role: string }>();
    for (const m of orgMembers) {
      const u = await db.query.users.findFirst({
        where: eq(users.id, m.userId),
      });
      if (u) {
        const userName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "Colleague";
        userMap.set(u.id, {
          email: u.email,
          name: userName,
          role: m.role,
        });
      }
    }

    const adminUsers = Array.from(userMap.entries()).filter(([_, u]) => u.role === "admin");

    // ========================================================================
    // A. CHECK UPCOMING REPORTS
    // ========================================================================
    const orgReports = await db.query.reports.findMany({
      where: and(
        eq(reports.organizationId, org.id),
        ne(reports.status, "submitted"),
        sql`${reports.deletedAt} IS NULL`
      ),
      with: {
        // grant relation
      },
    });

    for (const report of orgReports) {
      const grant = await db.query.grants.findFirst({
        where: eq(grants.id, report.grantId),
      });
      const grantName = grant?.funderName || "Grant";

      const daysDiff = calculateDaysDifference(localDateStr, report.dueDate);

      if (activeDaysBeforeSet.has(daysDiff)) {
        // Recipients for report: submitter or admins
        const targetRecipients = adminUsers;

        for (const [userId, userObj] of targetRecipients) {
          // Check D-001 deduplication in reminder_log
          const alreadySent = await hasReminderBeenSent(
            org.id,
            "report",
            report.id,
            userId,
            daysDiff
          );

          if (alreadySent) {
            result.skippedDeduplicated++;
            continue;
          }

          const deepLink = `${appUrl}/app/reports/${report.id}`;
          const emailContent = renderDueReminderEmail({
            recipientName: userObj.name,
            targetType: "report",
            title: report.title,
            grantName,
            dueDate: report.dueDate,
            daysBefore: daysDiff,
            deepLink,
          });

          if (!options.dryRun) {
            await sendEmail({
              to: userObj.email,
              subject: emailContent.subject,
              html: emailContent.html,
              text: emailContent.text,
            });

            await logReminderSent({
              organizationId: org.id,
              targetType: "report",
              targetId: report.id,
              userId,
              daysBefore: daysDiff,
              channel: "email",
              sentAt: currentUtc,
            });
          }

          result.remindersSent++;
          result.details.push({
            orgId: org.id,
            orgName: org.name,
            type: "report",
            targetTitle: report.title,
            recipientEmail: userObj.email,
            daysBefore: daysDiff,
          });
        }
      }
    }

    // ========================================================================
    // B. CHECK UPCOMING REQUIREMENTS
    // ========================================================================
    const orgRequirements = await db.query.requirements.findMany({
      where: and(
        eq(requirements.organizationId, org.id),
        ne(requirements.status, "verified")
      ),
    });

    for (const req of orgRequirements) {
      if (!req.dueDate) continue;

      const report = await db.query.reports.findFirst({
        where: eq(reports.id, req.reportId),
      });
      const grant = report
        ? await db.query.grants.findFirst({ where: eq(grants.id, report.grantId) })
        : null;
      const grantName = grant?.funderName || "Grant";

      const daysDiff = calculateDaysDifference(localDateStr, req.dueDate);

      if (activeDaysBeforeSet.has(daysDiff)) {
        // Recipients: assignee user, or fallback to admins if unassigned
        const recipientList: Array<[string, { email: string; name: string; role: string }]> = [];
        if (req.assigneeUserId && userMap.has(req.assigneeUserId)) {
          recipientList.push([req.assigneeUserId, userMap.get(req.assigneeUserId)!]);
        } else {
          recipientList.push(...adminUsers);
        }

        for (const [userId, userObj] of recipientList) {
          const alreadySent = await hasReminderBeenSent(
            org.id,
            "requirement",
            req.id,
            userId,
            daysDiff
          );

          if (alreadySent) {
            result.skippedDeduplicated++;
            continue;
          }

          const deepLink = `${appUrl}/app/reports/${req.reportId}`;
          const emailContent = renderDueReminderEmail({
            recipientName: userObj.name,
            targetType: "requirement",
            title: req.title,
            grantName,
            dueDate: req.dueDate,
            daysBefore: daysDiff,
            deepLink,
          });

          if (!options.dryRun) {
            await sendEmail({
              to: userObj.email,
              subject: emailContent.subject,
              html: emailContent.html,
              text: emailContent.text,
            });

            await logReminderSent({
              organizationId: org.id,
              targetType: "requirement",
              targetId: req.id,
              userId,
              daysBefore: daysDiff,
              channel: "email",
              sentAt: currentUtc,
            });
          }

          result.remindersSent++;
          result.details.push({
            orgId: org.id,
            orgName: org.name,
            type: "requirement",
            targetTitle: req.title,
            recipientEmail: userObj.email,
            daysBefore: daysDiff,
          });
        }
      }
    }

    // ========================================================================
    // C. MONDAY WEEKLY ADMIN DIGEST
    // ========================================================================
    if (isMondayInTimezone(orgTz, currentUtc)) {
      const overdueList: WeeklyDigestItem[] = [];
      const dueThisWeekList: WeeklyDigestItem[] = [];

      for (const report of orgReports) {
        const grant = await db.query.grants.findFirst({
          where: eq(grants.id, report.grantId),
        });
        const diff = calculateDaysDifference(localDateStr, report.dueDate);
        const item: WeeklyDigestItem = {
          title: report.title,
          grantName: grant?.funderName || "Grant",
          dueDate: report.dueDate,
          targetType: "report",
        };

        if (diff < 0) {
          overdueList.push(item);
        } else if (diff <= 7) {
          dueThisWeekList.push(item);
        }
      }

      for (const req of orgRequirements) {
        if (!req.dueDate) continue;
        const report = await db.query.reports.findFirst({
          where: eq(reports.id, req.reportId),
        });
        const grant = report
          ? await db.query.grants.findFirst({ where: eq(grants.id, report.grantId) })
          : null;
        const diff = calculateDaysDifference(localDateStr, req.dueDate);
        const item: WeeklyDigestItem = {
          title: req.title,
          grantName: grant?.funderName || "Grant",
          dueDate: req.dueDate,
          targetType: "requirement",
        };

        if (diff < 0) {
          overdueList.push(item);
        } else if (diff <= 7) {
          dueThisWeekList.push(item);
        }
      }

      // If there are admins and at least one item or activity
      if (adminUsers.length > 0 && (overdueList.length > 0 || dueThisWeekList.length > 0)) {
        for (const [adminId, adminUser] of adminUsers) {
          // Deduplicate weekly digest: daysBefore = 9999 as sentinel for weekly digest
          const digestSent = await hasReminderBeenSent(
            org.id,
            "report", // targetType
            org.id, // targetId = orgId for digest
            adminId,
            9999 // daysBefore sentinel
          );

          if (!digestSent) {
            const digestContent = renderWeeklyDigestEmail({
              recipientName: adminUser.name,
              orgName: org.name,
              overdueItems: overdueList,
              dueThisWeekItems: dueThisWeekList,
              deepLink: `${appUrl}/app`,
            });

            if (!options.dryRun) {
              await sendEmail({
                to: adminUser.email,
                subject: digestContent.subject,
                html: digestContent.html,
                text: digestContent.text,
              });

              await logReminderSent({
                organizationId: org.id,
                targetType: "report",
                targetId: org.id,
                userId: adminId,
                daysBefore: 9999,
                channel: "email",
                sentAt: currentUtc,
              });
            }

            result.digestsSent++;
          } else {
            result.skippedDeduplicated++;
          }
        }
      }
    }
  }

  return result;
}
