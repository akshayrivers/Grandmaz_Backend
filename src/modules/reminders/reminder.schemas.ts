import { z } from "zod";

export const reportReminderSchema = z
  .object({
    reminderId: z.string().trim().min(1).max(64),
    status: z.enum(["taken", "snoozed", "missed"]),
  })
  .strict();
