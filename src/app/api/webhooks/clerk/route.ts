import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, users, memberships } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { normalizeClerkRole } from "@/lib/auth";

interface EmailAddressJSON {
  id: string;
  email_address: string;
}

interface ClerkWebhookData {
  id?: string;
  email_addresses?: EmailAddressJSON[];
  primary_email_address_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string;
  slug?: string;
  role?: string;
  organization?: { id: string };
  public_user_data?: { user_id: string };
}

interface WebhookEvent {
  data: ClerkWebhookData;
  type: string;
}

export async function POST(req: Request) {
  const webhookSecret = env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Missing CLERK_WEBHOOK_SECRET environment variable");
    return NextResponse.json({ error: "Webhook secret unconfigured" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix signature headers" }, { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(webhookSecret);
  let event: WebhookEvent;

  try {
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as WebhookEvent;
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;

  try {
    switch (type) {
      // 1. User events
      case "user.created":
      case "user.updated": {
        const clerkUserId = data.id;
        if (!clerkUserId) break;

        const primaryEmail =
          data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
            ?.email_address ||
          data.email_addresses?.[0]?.email_address ||
          "user@example.com";
        const firstName = data.first_name || null;
        const lastName = data.last_name || null;

        await db
          .insert(users)
          .values({
            clerkUserId,
            email: primaryEmail,
            firstName,
            lastName,
          })
          .onConflictDoUpdate({
            target: users.clerkUserId,
            set: {
              email: primaryEmail,
              firstName,
              lastName,
              updatedAt: new Date(),
            },
          });
        break;
      }

      case "user.deleted": {
        const clerkUserId = data.id;
        if (clerkUserId) {
          await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
        }
        break;
      }

      // 2. Organization events
      case "organization.created":
      case "organization.updated": {
        const clerkOrgId = data.id;
        const name = data.name;
        if (!clerkOrgId || !name) break;

        const slug = data.slug || `org-${clerkOrgId.slice(4)}`;

        await db
          .insert(organizations)
          .values({
            clerkOrgId,
            name,
            slug,
            timezone: "America/New_York",
          })
          .onConflictDoUpdate({
            target: organizations.clerkOrgId,
            set: {
              name,
              slug,
              updatedAt: new Date(),
            },
          });
        break;
      }

      case "organization.deleted": {
        const clerkOrgId = data.id;
        if (clerkOrgId) {
          await db.delete(organizations).where(eq(organizations.clerkOrgId, clerkOrgId));
        }
        break;
      }

      // 3. Organization Membership events
      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const clerkOrgId = data.organization?.id;
        const clerkUserId = data.public_user_data?.user_id;
        const rawRole = data.role;
        const role = normalizeClerkRole(rawRole);

        if (!clerkOrgId || !clerkUserId) break;

        // Resolve local organization & user IDs
        const localOrg = await db.query.organizations.findFirst({
          where: eq(organizations.clerkOrgId, clerkOrgId),
        });
        const localUser = await db.query.users.findFirst({
          where: eq(users.clerkUserId, clerkUserId),
        });

        if (localOrg && localUser) {
          await db
            .insert(memberships)
            .values({
              organizationId: localOrg.id,
              userId: localUser.id,
              role,
            })
            .onConflictDoUpdate({
              target: [memberships.organizationId, memberships.userId],
              set: {
                role,
                updatedAt: new Date(),
              },
            });
        }
        break;
      }

      case "organizationMembership.deleted": {
        const clerkOrgId = data.organization?.id;
        const clerkUserId = data.public_user_data?.user_id;

        if (clerkOrgId && clerkUserId) {
          const localOrg = await db.query.organizations.findFirst({
            where: eq(organizations.clerkOrgId, clerkOrgId),
          });
          const localUser = await db.query.users.findFirst({
            where: eq(users.clerkUserId, clerkUserId),
          });

          if (localOrg && localUser) {
            await db
              .delete(memberships)
              .where(
                and(
                  eq(memberships.organizationId, localOrg.id),
                  eq(memberships.userId, localUser.id)
                )
              );
          }
        }
        break;
      }

      default:
        // Unhandled event type, acknowledge receipt
        break;
    }

    return NextResponse.json({ success: true, event: type });
  } catch (dbError) {
    console.error(`Error processing webhook ${type}:`, dbError);
    return NextResponse.json({ error: "Failed to persist webhook event" }, { status: 500 });
  }
}
