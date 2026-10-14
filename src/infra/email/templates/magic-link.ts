export interface MagicLinkEmailProps {
  inviteUrl: string;
  deviceName?: string | undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMagicLinkEmail({ inviteUrl, deviceName: rawDeviceName }: MagicLinkEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const deviceName = rawDeviceName ? escapeHtml(rawDeviceName) : undefined;
  const safeUrl = escapeHtml(inviteUrl);
  const subject = `Invitation to manage Grandma's Launcher ${rawDeviceName ? `(${rawDeviceName})` : ""}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          h1 { color: #1e1e1e; font-size: 24px; margin-top: 0; }
          p { color: #4a5568; line-height: 1.6; font-size: 16px; }
          .btn { display: inline-block; background-color: #e03131; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .footer { font-size: 13px; color: #a0aec0; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Caretaker Invitation</h1>
          <p>You have been invited to become a Caretaker for <strong>${deviceName || "Grandma's Device"}</strong> on Grandma's Launcher.</p>
          <p>Click the button below to accept your invitation and sign in to the Caretaker Dashboard.
          You will then be asked for the <strong>6-digit pairing code</strong> shown on Grandma's phone
          (or given to you by the family member who invited you).</p>
          <p><a href="${safeUrl}" class="btn" style="color: #ffffff;">Accept Invitation & Sign In</a></p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #3182ce;"><a href="${safeUrl}">${safeUrl}</a></p>
          <div class="footer">
            <p>If you were not expecting this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `You have been invited to become a Caretaker for ${rawDeviceName || "Grandma's Device"}.\n\nClick here to accept: ${inviteUrl}\n\nYou will need the 6-digit pairing code shown on Grandma's phone.`;

  return { subject, html, text };
}
