const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDERS_URL = "https://api.brevo.com/v3/senders";

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

interface BrevoSenderRow {
  email?: string;
  active?: boolean;
}

/**
 * Brevo accepts the send request and rejects an unknown sender afterwards, so a
 * 201 does not mean the invitation was delivered. Check the verified list first.
 */
async function assertVerifiedSender(apiKey: string, email: string): Promise<void> {
  const response = await fetch(SENDERS_URL, {
    headers: { accept: "application/json", "api-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Could not confirm the Brevo sender (${response.status})`);
  }

  const body = (await response.json()) as { senders?: BrevoSenderRow[] };
  const wanted = email.toLowerCase();
  const verified = (body.senders ?? []).some(
    (sender) => sender.active === true && sender.email?.toLowerCase() === wanted,
  );
  if (!verified) {
    throw new Error("EMAIL_FROM is not a verified Brevo sender");
  }
}

/**
 * Sends one invitation over HTTPS. Render's free instance blocks SMTP ports,
 * and Brevo's API is reached on port 443.
 */
export async function sendViaBrevo(message: BrevoMessage): Promise<string | undefined> {
  const apiKey = message.apiKey.trim();
  if (apiKey.startsWith("xsmtpsib-")) {
    throw new Error(
      "BREVO_API_KEY is an SMTP key. In Brevo open SMTP & API, then API keys, and create a key that starts with xkeysib-",
    );
  }

  const sender = parseFromAddress(message.from);
  await assertVerifiedSender(apiKey, sender.email);

  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender,
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
