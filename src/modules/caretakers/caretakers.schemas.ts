import { z } from "zod";

export const linkCaretakerSchema = z.object({
  deviceId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["primary", "secondary", "admin"]).optional(),
});

export const updateCaretakerRoleSchema = z.object({
  role: z.enum(["primary", "secondary", "admin"]),
});
