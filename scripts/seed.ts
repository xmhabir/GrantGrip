import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import {
  organizations,
  users,
  memberships,
  grants,
  reports,
  requirements,
  activityLogs,
} from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(dbUrl);
  const db = drizzle(sql, { schema });

  console.log("Seeding GrantGrip database for local testing...");

  // 1. Create or get Demo Organization
  const orgSlug = "hope-valley-arts";
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, orgSlug));

  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        name: "Hope Valley Community Arts",
        slug: orgSlug,
        clerkOrgId: "org_demo_hope_valley",
        timezone: "America/New_York",
        plan: "growth",
      })
      .returning();
    console.log(`Created demo organization: ${org.name} (${org.id})`);
  } else {
    console.log(`Using existing demo organization: ${org.name} (${org.id})`);
  }

  // 2. Create or get Demo User
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, "director@hopevalleyarts.org"));

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        clerkUserId: "user_demo_director",
        email: "director@hopevalleyarts.org",
        firstName: "Sarah",
        lastName: "Jenkins",
      })
      .returning();
    console.log(`Created demo user: ${user.email} (${user.id})`);
  }

  // Ensure membership
  const [existingMembership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.organizationId, org.id));

  if (!existingMembership) {
    await db.insert(memberships).values({
      organizationId: org.id,
      userId: user.id,
      role: "admin",
    });
  }

  // 3. Seed Grants (6 grants)
  const sampleGrants = [
    {
      funderName: "The MacArthur Foundation",
      opportunityNumber: "MAC-2026-ART-014",
      awardAmountCents: 15000000, // $150,000
      currency: "USD",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "active",
      programArea: "Arts & Culture",
      notes: "Annual general operating support. Quarterly financial reporting and year-end impact narrative.",
    },
    {
      funderName: "National Endowment for the Arts",
      opportunityNumber: "NEA-GR-99482",
      awardAmountCents: 5000000, // $50,000
      currency: "USD",
      startDate: "2026-03-01",
      endDate: "2027-02-28",
      status: "active",
      programArea: "Youth Music Education",
      notes: "Requires federal compliance tracking, non-federal cost match certification, and participant logs.",
    },
    {
      funderName: "California Arts Council",
      opportunityNumber: "CAC-26-YOUTH-003",
      awardAmountCents: 2500000, // $25,000
      currency: "USD",
      startDate: "2026-04-01",
      endDate: "2026-10-31",
      status: "active",
      programArea: "Youth Arts Mentorship",
      notes: "Mid-term progress report with student survey results.",
    },
    {
      funderName: "Ford Foundation",
      opportunityNumber: "FF-2025-EQUITY",
      awardAmountCents: 20000000, // $200,000
      currency: "USD",
      startDate: "2025-06-01",
      endDate: "2026-05-31",
      status: "active",
      programArea: "Community Equity",
      notes: "Multi-year initiative focused on underserved neighborhood cultural hubs.",
    },
    {
      funderName: "Silicon Valley Community Foundation",
      opportunityNumber: "SVCF-COMM-2026",
      awardAmountCents: 3500000, // $35,000
      currency: "USD",
      startDate: "2026-02-01",
      endDate: "2026-08-31",
      status: "active",
      programArea: "Digital Inclusion",
      notes: "Hardware and instruction expense receipts must accompany final report.",
    },
    {
      funderName: "Wells Fargo Community Grant",
      opportunityNumber: "WF-2025-LOCAL",
      awardAmountCents: 1500000, // $15,000
      currency: "USD",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      status: "completed",
      programArea: "General Community Support",
      notes: "Successfully completed and approved.",
    },
  ];

  for (const gData of sampleGrants) {
    const [existingGrant] = await db
      .select()
      .from(grants)
      .where(eq(grants.opportunityNumber, gData.opportunityNumber));

    let grantId = existingGrant?.id;

    if (!existingGrant) {
      const [newGrant] = await db
        .insert(grants)
        .values({
          ...gData,
          organizationId: org.id,
          leadUserId: user.id,
        })
        .returning();
      grantId = newGrant.id;
      console.log(`Created grant: ${gData.funderName}`);

      await db.insert(activityLogs).values({
        organizationId: org.id,
        actorUserId: user.id,
        action: "create",
        entityType: "grant",
        entityId: grantId,
        metadata: { funderName: gData.funderName },
      });
    }

    // Seed 1-2 reports per grant
    if (grantId) {
      const sampleReports = [
        {
          title: `Mid-Year Progress & Financial Review`,
          reportType: "progress",
          periodStart: "2026-01-01",
          periodEnd: "2026-06-30",
          dueDate: "2026-11-15",
          status: "draft",
          notes: "Focus on student outreach metrics and expense verification.",
        },
        {
          title: `Final Narrative & Grant Closeout`,
          reportType: "final",
          periodStart: "2026-01-01",
          periodEnd: "2026-12-31",
          dueDate: "2026-12-15",
          status: "draft",
          notes: "Year-end audited figures and board resolution.",
        },
      ];

      for (const rData of sampleReports) {
        const [existingReport] = await db
          .select()
          .from(reports)
          .where(eq(reports.grantId, grantId));

        if (!existingReport) {
          const [newReport] = await db
            .insert(reports)
            .values({
              ...rData,
              grantId,
              organizationId: org.id,
            })
            .returning();
          console.log(`  Added report: ${rData.title}`);

          // Seed requirements
          const reqs = [
            {
              title: "General Ledger Expense Breakdown",
              requirementType: "financial",
              status: "provided",
              description: "Itemized accounting export matching grant budget categories.",
              dueDate: "2026-11-08",
            },
            {
              title: "Participant Demographic Survey Results",
              requirementType: "metric",
              status: "verified",
              description: "Survey data representing at least 80 youth attendees.",
              dueDate: "2026-11-05",
            },
            {
              title: "Program Director Impact Narrative",
              requirementType: "narrative",
              status: "open",
              description: "2-3 page summary of key achievements and learnings.",
              dueDate: "2026-11-10",
            },
            {
              title: "Media Release Forms & Photo Documentation",
              requirementType: "document",
              status: "open",
              description: "Signed guardian photo release consent forms.",
              dueDate: "2026-11-12",
            },
          ];

          for (let i = 0; i < reqs.length; i++) {
            await db.insert(requirements).values({
              ...reqs[i],
              reportId: newReport.id,
              organizationId: org.id,
              assigneeUserId: user.id,
              sortOrder: i,
            });
          }
        }
      }
    }
  }

  console.log("Seeding complete! You can now log into GrantGrip and test with realistic data.");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
