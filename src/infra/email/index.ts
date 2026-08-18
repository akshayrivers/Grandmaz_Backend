import { getTransporter } from "./client.js";
import { renderMagicLinkEmail } from "./templates/magic-link.js";
import { env } from "../../config/index.js";

export interface SendInvitationOptions {
  toEmail: string;
  invitationToken: string;
  deviceName?: string | undefined;
}

export async function sendInvitationEmail({
  toEmail,
  invitationToken,
  deviceName,
}: SendInvitationOptions): Promise<{ success: boolean; inviteUrl: string; messageId?: string | undefined }> {
  const inviteUrl = `${env.CARETAKER_WEB_URL}/accept-invitation?token=${encodeURIComponent(invitationToken)}`;
  const transport = getTransporter();

  const { subject, html, text } = renderMagicLinkEmail({ inviteUrl, deviceName });

  if (!transport) {
    console.log("--------------------------------------------------");
    console.log("💌 [DEV MODE - NO SMTP CONFIG]");
    console.log(`To: ${toEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Magic Link URL: ${inviteUrl}`);
    console.log("--------------------------------------------------");
    return { success: true, inviteUrl };
  }

  try {
    const info = await transport.sendMail({
      from: env.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text,
    });

    return { success: true, inviteUrl, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending email via SMTP:", error);
    throw new Error("Failed to send invitation email");
  }
}
