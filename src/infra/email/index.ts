import { getResendClient } from "./client.js";
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
  const resend = getResendClient();

  const { subject, html, text } = renderMagicLinkEmail({ inviteUrl, deviceName });

  if (!resend) {
    console.log("--------------------------------------------------");
    console.log("💌 [DEV MODE - NO RESEND API KEY]");
    console.log(`To: ${toEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Magic Link URL: ${inviteUrl}`);
    console.log("--------------------------------------------------");
    return { success: true, inviteUrl };
  }

  try {
    const data = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [toEmail],
      subject,
      html,
      text,
    });

    return { success: true, inviteUrl, messageId: data.data?.id };
  } catch (error) {
    console.error("❌ Error sending email via Resend:", error);
    throw new Error("Failed to send invitation email");
  }
}
