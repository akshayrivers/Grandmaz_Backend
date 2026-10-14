import { z } from "zod";

export const caretakerParamsSchema = z.object({
  deviceId: z.string().min(1),
  caretakerId: z.uuid("Invalid caretaker id"),
});

export const updateCaretakerRoleSchema = z.object({
  role: z.enum(["caretaker", "viewer"]),
});

export const transferPrimarySchema = z.object({
  caretakerId: z.uuid("Invalid caretaker id"),
});
