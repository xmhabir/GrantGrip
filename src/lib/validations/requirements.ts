import { z } from "zod";

export const requirementTypeValues = ["document", "metric", "narrative", "financial"] as const;
export type RequirementType = (typeof requirementTypeValues)[number];

export const requirementStatusValues = ["open", "provided", "verified"] as const;
export type RequirementStatus = (typeof requirementStatusValues)[number];

export const CreateRequirementSchema = z.object({
  reportId: z.string().uuid("Invalid report ID"),
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(300, "Title must be 300 characters or fewer")
    .trim(),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer")
    .trim()
    .optional()
    .or(z.literal("")),
  requirementType: z.enum(requirementTypeValues).default("document"),
  status: z.enum(requirementStatusValues).default("open"),
  assigneeUserId: z.string().uuid("Invalid assignee user ID").nullable().optional(),
  dueDate: z.string().date("Invalid due date (YYYY-MM-DD)").nullable().optional(),
  sortOrder: z.number().int().default(0).optional(),
});

export const UpdateRequirementSchema = CreateRequirementSchema.partial().omit({ reportId: true });

export const ReorderRequirementsSchema = z.object({
  reportId: z.string().uuid("Invalid report ID"),
  items: z.array(
    z.object({
      id: z.string().uuid("Invalid requirement ID"),
      sortOrder: z.number().int(),
    })
  ),
});

export type CreateRequirementInput = z.infer<typeof CreateRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof UpdateRequirementSchema>;
export type ReorderRequirementsInput = z.infer<typeof ReorderRequirementsSchema>;
