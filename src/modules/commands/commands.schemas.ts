import { z } from "zod";

export const createTaskSchema = z.object({
  deviceId: z.string().min(1),
  title: z.string().min(1).max(255),
  command: z.string().min(1).max(255),
  description: z.string().optional(),
  payload: z.any().optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(["pending", "sent", "running", "completed", "failed", "cancelled"]),
  result: z.any().optional(),
});
