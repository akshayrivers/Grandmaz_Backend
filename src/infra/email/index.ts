import { getTransporter } from "./client.js";
import { renderMagicLinkEmail } from "./templates/magic-link.js";
import { env } from "../../config/index.js";

export interface SendInvitationOptions {
  toEmail: string;
  invitationToken: string;
  deviceName?: string | undefined;
}

export function buildInvitationUrl(invitationToken: string): string {
  return `${env.appBaseUrl}/accept-invitation?token=${encodeURIComponent(invitationToken)}`;
}

/**
 * Emails the magic link. Without SMTP config (local dev only) the link is printed to the
 * console instead so the pairing flow can still be tested; it is never returned by the API.
 */
export async function sendInvitationEmail({
  toEmail,
  invitationToken,
  deviceName,
}: SendInvitationOptions): Promise<{ delivered: boolean; messageId?: string | undefined }> {
  const inviteUrl = buildInvitationUrl(invitationToken);
  const transport = await getTransporter();
  const { subject, html, text } = renderMagicLinkEmail({ inviteUrl, deviceName });

  if (!transport) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured");
    }
    console.log("--------------------------------------------------");
    console.log("💌 [DEV MODE - NO SMTP CONFIG] Invitation magic link:");
    console.log(inviteUrl);
    console.log("--------------------------------------------------");
    return { delivered: false };
  }

  const info = await transport.sendMail({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject,
    html,
    text,
  });
  return { delivered: true, messageId: info.messageId };
}
