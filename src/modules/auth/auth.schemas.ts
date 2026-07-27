import { z } from "zod";

export const VerifyTokenSchema = z.object({
  idToken: z.string().min(1, "Firebase ID token is required"),
});

export const AcceptInvitationSchema = z.object({
  idToken: z.string().min(1, "Firebase ID token is required"),
  invitationToken: z.string().min(1, "Invitation token is required"),
});

export type VerifyTokenInput = z.infer<typeof VerifyTokenSchema>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;
