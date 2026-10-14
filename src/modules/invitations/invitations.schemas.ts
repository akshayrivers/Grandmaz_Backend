import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Valid email address is required"));

export const DeviceCreateInvitationSchema = z.object({
  email: emailSchema,
});

export const CaretakerCreateInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["caretaker", "viewer"]).default("caretaker"),
});

export const InvitationPreviewSchema = z.object({
  token: z.string().min(16).max(200),
});

export const AcceptInvitationSchema = z.object({
  invitationToken: z.string().min(16).max(200),
  pairingCode: z.string().regex(/^\d{6}$/, "Pairing code must be 6 digits"),
});

export const InvitationIdParamsSchema = z.object({
  id: z.uuid("Invalid invitation id"),
});
