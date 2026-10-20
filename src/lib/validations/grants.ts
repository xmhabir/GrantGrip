import { z } from "zod";

export const grantStatusValues = ["active", "completed", "archived"] as const;
export type GrantStatus = (typeof grantStatusValues)[number];

export const CreateGrantSchema = z
  .object({
    funderName: z
      .string()
      .min(2, "Funder name must be at least 2 characters")
      .max(200, "Funder name must be 200 characters or fewer")
      .trim(),
    opportunityNumber: z
      .string()
      .max(100, "Opportunity number must be 100 characters or fewer")
      .trim()
      .optional()
      .or(z.literal("")),
    awardAmountCents: z
      .number({ error: "Award amount must be a number" })
      .int("Award amount must be a whole number of cents")
      .nonnegative("Award amount cannot be negative")
      .max(999_999_999_999, "Award amount is too large")
      .nullable()
      .optional(),
    currency: z.string().length(3, "Currency must be a 3-letter ISO code").default("USD"),
    startDate: z.string().date("Invalid start date (YYYY-MM-DD)").nullable().optional(),
    endDate: z.string().date("Invalid end date (YYYY-MM-DD)").nullable().optional(),
    status: z.enum(grantStatusValues).default("active"),
    programArea: z
      .string()
      .max(100, "Program area must be 100 characters or fewer")
      .trim()
      .optional()
      .or(z.literal("")),
    leadUserId: z.string().uuid("Invalid user ID").nullable().optional(),
    notes: z
      .string()
      .max(5000, "Notes must be 5000 characters or fewer")
      .trim()
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    { message: "End date must be on or after start date", path: ["endDate"] }
  );

export const UpdateGrantSchema = CreateGrantSchema.partial();

export type CreateGrantInput = z.infer<typeof CreateGrantSchema>;
export type UpdateGrantInput = z.infer<typeof UpdateGrantSchema>;

export function dollarsToCents(dollarString: string): number | null {
  const cleaned = dollarString.replace(/[,$\s]/g, "");
  if (!cleaned) return null;
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}
