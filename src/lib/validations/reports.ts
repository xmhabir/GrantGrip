import { z } from "zod";

export const reportTypeValues = ["progress", "financial", "final", "other"] as const;
export type ReportType = (typeof reportTypeValues)[number];

export const reportStatusValues = ["draft", "submitted", "approved"] as const;
export type ReportStatus = (typeof reportStatusValues)[number];

export const CreateReportSchema = z
  .object({
    grantId: z.string().uuid("Invalid grant ID"),
    title: z
      .string()
      .min(2, "Title must be at least 2 characters")
      .max(300, "Title must be 300 characters or fewer")
      .trim(),
    reportType: z.enum(reportTypeValues, {
      error: "Invalid report type",
    }),
    periodStart: z.string().date("Invalid period start date (YYYY-MM-DD)").nullable().optional(),
    periodEnd: z.string().date("Invalid period end date (YYYY-MM-DD)").nullable().optional(),
    dueDate: z.string().date("Due date is required and must be YYYY-MM-DD"),
    status: z.enum(reportStatusValues).default("draft"),
    narrative: z
      .string()
      .max(50_000, "Narrative must be 50,000 characters or fewer")
      .trim()
      .optional()
      .or(z.literal("")),
    notes: z
      .string()
      .max(5000, "Notes must be 5000 characters or fewer")
      .trim()
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.periodStart && data.periodEnd) {
        return data.periodEnd >= data.periodStart;
      }
      return true;
    },
    { message: "Period end must be on or after period start", path: ["periodEnd"] }
  );

export const UpdateReportSchema = CreateReportSchema.partial().omit({ grantId: true });

export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type UpdateReportInput = z.infer<typeof UpdateReportSchema>;
