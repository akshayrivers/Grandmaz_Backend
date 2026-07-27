import { z } from "zod";

export const createAuditLogSchema = z.object({
  action: z.string().min(1).max(255),
  deviceId: z.string().optional(),
  userId: z.string().optional(),
  details: z.any().optional(),
});
