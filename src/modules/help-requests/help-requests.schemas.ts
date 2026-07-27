import { z } from "zod";

export const createHelpRequestSchema = z.object({
  deviceId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(["general", "sos", "medical", "tech_support"]).optional(),
});

export const resolveHelpRequestSchema = z.object({
  status: z.enum(["resolved", "in_progress", "cancelled", "pending"]),
});
