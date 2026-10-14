import { z } from "zod";

export const createHelpRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: z.enum(["general", "sos", "medical", "tech_support"]).default("general"),
});

export const resolveHelpRequestSchema = z.object({
  status: z.enum(["resolved", "in_progress", "cancelled", "pending"]),
});

export const helpRequestIdParamsSchema = z.object({
  id: z.uuid("Invalid help request id"),
});
