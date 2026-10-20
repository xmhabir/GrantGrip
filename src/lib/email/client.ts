import { env } from "@/lib/env";
import { randomUUID } from "crypto";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * In-memory log of sent emails during test runs or mock mode.
 */
export const mockSentEmails: Array<{
  to: string | string[];
  subject: string;
  html: string;
  sentAt: Date;
}> = [];

/**
 * Dispatches an email via Resend API.
 * Gracefully operates in mock mode if RESEND_API_KEY is not configured.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const from = options.from || env.RESEND_FROM_EMAIL || "GrantGrip <notifications@grantgrip.com>";
  const to = Array.isArray(options.to) ? options.to : [options.to];

  // If no API key configured or in test environment, mock sending
  if (!env.RESEND_API_KEY || env.NODE_ENV === "test" || env.RESEND_API_KEY.includes("dummy")) {
    const mockId = `mock-email-${randomUUID()}`;
    mockSentEmails.push({
      to,
      subject: options.subject,
      html: options.html,
      sentAt: new Date(),
    });
    console.log(`[Email Mock] Sent to ${to.join(", ")} | Subject: ${options.subject}`);
    return { success: true, id: mockId };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Email] Resend API error:", response.status, errorData);
      return {
        success: false,
        error: errorData?.message || `Resend error HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error("[Email] Failed to send email:", error);
    return { success: false, error: error?.message || "Unknown error sending email" };
  }
}
