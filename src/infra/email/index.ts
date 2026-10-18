import { sendViaBrevo } from "./brevo.js";
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
 * Emails the magic link. Brevo (HTTPS) is preferred because Render's free instance
 * blocks SMTP. Without either, local dev prints the link; it is never returned by the API.
 */
export async function sendInvitationEmail({
  toEmail,
  invitationToken,
  deviceName,
}: SendInvitationOptions): Promise<{ delivered: boolean; messageId?: string | undefined }> {
  const inviteUrl = buildInvitationUrl(invitationToken);
  const { subject, html, text } = renderMagicLinkEmail({ inviteUrl, deviceName });

  if (env.BREVO_API_KEY?.startsWith("xkeysib-")) {
    const messageId = await sendViaBrevo({
      apiKey: env.BREVO_API_KEY,
      from: env.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text,
    });
    return messageId ? { delivered: true, messageId } : { delivered: true };
  }

  const transport = await getTransporter();

  if (!transport) {
    if (env.NODE_ENV === "production") {
      throw new Error("Invitation email is not configured");
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
