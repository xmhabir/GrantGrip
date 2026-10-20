export interface DueReminderEmailProps {
  recipientName: string;
  targetType: "report" | "requirement";
  title: string;
  grantName: string;
  dueDate: string;
  daysBefore: number;
  deepLink: string;
}

export interface WeeklyDigestItem {
  title: string;
  grantName: string;
  dueDate: string;
  targetType: "report" | "requirement";
}

export interface WeeklyDigestEmailProps {
  recipientName: string;
  orgName: string;
  overdueItems: WeeklyDigestItem[];
  dueThisWeekItems: WeeklyDigestItem[];
  deepLink: string;
}

/**
 * Generates HTML for deadline reminders.
 */
export function renderDueReminderEmail(props: DueReminderEmailProps): { subject: string; html: string; text: string } {
  const { recipientName, targetType, title, grantName, dueDate, daysBefore, deepLink } = props;

  let urgencyText = `Due in ${daysBefore} days`;
  let badgeColor = "#059669"; // Emerald
  let badgeBg = "#ecfdf5";

  if (daysBefore === 0) {
    urgencyText = "Due Today";
    badgeColor = "#d97706"; // Amber
    badgeBg = "#fffbeb";
  } else if (daysBefore < 0) {
    urgencyText = `Overdue by ${Math.abs(daysBefore)} day${Math.abs(daysBefore) === 1 ? "" : "s"}`;
    badgeColor = "#dc2626"; // Red
    badgeBg = "#fef2f2";
  } else if (daysBefore <= 7) {
    urgencyText = `Due in ${daysBefore} days`;
    badgeColor = "#d97706";
    badgeBg = "#fffbeb";
  }

  const itemTypeName = targetType === "report" ? "Report" : "Reporting Requirement";
  const subject = `[GrantGrip] ${urgencyText}: ${title} (${grantName})`;

  const text = `
Hello ${recipientName || "Team Member"},

This is an automated reminder regarding an upcoming deadline in your GrantGrip workspace:

Item: ${title} (${itemTypeName})
Grant: ${grantName}
Due Date: ${dueDate}
Status: ${urgencyText}

View details and submit evidence:
${deepLink}

Best regards,
The GrantGrip Compliance Bot
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 24px 32px; color: #ffffff; }
    .brand { font-size: 18px; font-weight: 700; color: #10b981; letter-spacing: -0.5px; }
    .content { padding: 32px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .card { background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; margin: 24px 0; }
    .card-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    .card-label { color: #64748b; font-weight: 500; }
    .card-value { color: #0f172a; font-weight: 600; text-align: right; }
    .btn { display: inline-block; background-color: #059669; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; }
    .footer { padding: 24px 32px; background: #f1f5f9; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">GrantGrip</div>
      <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Automated Compliance Alert</div>
    </div>
    <div class="content">
      <div style="margin-bottom: 16px;">
        <span class="badge" style="background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
          ${urgencyText}
        </span>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #0f172a;">${title}</h2>
      <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0 0 16px 0;">
        Hello ${recipientName || "there"}, you have an upcoming deadline for <strong>${grantName}</strong>. Please ensure all required documentation and narrative requirements are satisfied.
      </p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Type:</span>
          <span class="card-value">${itemTypeName}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Grant:</span>
          <span class="card-value">${grantName}</span>
        </div>
        <div class="card-row" style="margin-bottom: 0;">
          <span class="card-label">Deadline:</span>
          <span class="card-value" style="color: ${badgeColor}; font-weight: 700;">${dueDate}</span>
        </div>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${deepLink}" class="btn" target="_blank">View Item in Workspace &rarr;</a>
      </div>
    </div>
    <div class="footer">
      Sent by GrantGrip &bull; Scoped to your organization workspace.<br />
      To modify reminder timing, visit your Workspace Settings.
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}

/**
 * Generates HTML for Monday weekly admin digests.
 */
export function renderWeeklyDigestEmail(props: WeeklyDigestEmailProps): { subject: string; html: string; text: string } {
  const { recipientName, orgName, overdueItems, dueThisWeekItems, deepLink } = props;

  const subject = `[GrantGrip] Weekly Grant Compliance Digest — ${orgName}`;

  const text = `
Hello ${recipientName || "Team"},

Here is your weekly grant reporting summary for ${orgName}:

Overdue Items: ${overdueItems.length}
Due This Week: ${dueThisWeekItems.length}

${overdueItems.length > 0 ? "OVERDUE ITEMS:\n" + overdueItems.map((i) => `- ${i.title} (${i.grantName}) — Due: ${i.dueDate}`).join("\n") + "\n\n" : ""}
${dueThisWeekItems.length > 0 ? "DUE THIS WEEK:\n" + dueThisWeekItems.map((i) => `- ${i.title} (${i.grantName}) — Due: ${i.dueDate}`).join("\n") + "\n\n" : ""}

Access your full dashboard:
${deepLink}

Best regards,
The GrantGrip Team
`.trim();

  const renderItemList = (items: WeeklyDigestItem[], isOverdue: boolean) => {
    if (items.length === 0) {
      return `<p style="font-size: 13px; color: #94a3b8; font-style: italic; margin: 8px 0;">None! All clear.</p>`;
    }

    return items
      .map(
        (item) => `
        <div style="padding: 10px 14px; background: ${isOverdue ? "#fef2f2" : "#f8fafc"}; border: 1px solid ${isOverdue ? "#fecaca" : "#e2e8f0"}; border-radius: 8px; margin-bottom: 8px;">
          <div style="font-weight: 600; font-size: 14px; color: #0f172a;">${item.title}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
            Grant: <strong>${item.grantName}</strong> &bull; Due: <span style="font-weight: 600; color: ${isOverdue ? "#dc2626" : "#d97706"};">${item.dueDate}</span>
          </div>
        </div>
      `
      )
      .join("");
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 24px 32px; color: #ffffff; }
    .brand { font-size: 18px; font-weight: 700; color: #10b981; }
    .content { padding: 32px; }
    .stat-grid { display: flex; gap: 12px; margin-bottom: 24px; }
    .stat-box { flex: 1; padding: 14px; border-radius: 10px; text-align: center; }
    .btn { display: inline-block; background-color: #059669; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; }
    .footer { padding: 20px 32px; background: #f1f5f9; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">GrantGrip</div>
      <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Monday Weekly Compliance Digest &bull; ${orgName}</div>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 16px 0; color: #0f172a;">Weekly Briefing</h2>
      <p style="font-size: 14px; color: #475569; margin: 0 0 20px 0;">
        Good morning ${recipientName || "Team"}. Here is your compliance status for the upcoming week.
      </p>

      <div style="margin-bottom: 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 12px 0;">
          <tr>
            <td width="50%" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 16px; text-align: center;">
              <div style="font-size: 26px; font-weight: 800; color: #dc2626;">${overdueItems.length}</div>
              <div style="font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; margin-top: 4px;">Overdue Items</div>
            </td>
            <td width="50%" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; text-align: center;">
              <div style="font-size: 26px; font-weight: 800; color: #d97706;">${dueThisWeekItems.length}</div>
              <div style="font-size: 12px; font-weight: 600; color: #92400e; text-transform: uppercase; margin-top: 4px;">Due This Week</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px 0;">
          Critical: Overdue Items (${overdueItems.length})
        </h3>
        ${renderItemList(overdueItems, true)}
      </div>

      <div style="margin-bottom: 28px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px 0;">
          Upcoming This Week (${dueThisWeekItems.length})
        </h3>
        ${renderItemList(dueThisWeekItems, false)}
      </div>

      <div style="text-align: center;">
        <a href="${deepLink}" class="btn" target="_blank">Open Grant Workspace &rarr;</a>
      </div>
    </div>
    <div class="footer">
      Delivered automatically every Monday at 9:00 AM in your organization's local timezone.
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}
