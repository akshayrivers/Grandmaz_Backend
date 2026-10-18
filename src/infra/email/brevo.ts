const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoMessage {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface BrevoSender {
  email: string;
  name?: string;
}

/** Accepts `Name <email@host>` or a bare email address. */
export function parseFromAddress(from: string): BrevoSender {
  const trimmed = from.trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    if (!trimmed.includes("@")) {
      throw new Error("EMAIL_FROM must be the Brevo-verified sender address");
    }
    return { email: trimmed };
  }

  const email = match[2]?.trim() ?? "";
  const name = match[1]?.trim().replace(/^["']|["']$/g, "");
  if (!email.includes("@")) {
    throw new Error("EMAIL_FROM must be the Brevo-verified sender address");
  }
  if (name) {
    return { name, email };
  }
  return { email };
}

/**
 * Sends one invitation over HTTPS. Render's free instance blocks SMTP ports,
 * and Brevo's API is reached on port 443.
 */
export async function sendViaBrevo(message: BrevoMessage): Promise<string | undefined> {
  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": message.apiKey,
    },
    body: JSON.stringify({
      sender: parseFromAddress(message.from),
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message.length > 0) {
        detail = body.message;
      }
    } catch {
      // The status line is enough when the body is not JSON.
    }
    throw new Error(`Invitation email was not accepted (${response.status}): ${detail}`);
  }

  const body = (await response.json()) as { messageId?: unknown };
  return typeof body.messageId === "string" ? body.messageId : undefined;
}
