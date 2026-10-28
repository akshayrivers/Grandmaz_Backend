import { DEFAULT_GEMINI_MODEL } from "../device-config/device-config.schemas.js";
import { AppError } from "../../shared/errors/app-error.js";

const TOKEN_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

/** REST path the phone calls. The API key stays on the server; this URL carries only the model id. */
export function geminiGenerateContentUrl(model: string): string {
  const id = model.trim().replace(/^models\//, "") || DEFAULT_GEMINI_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`;
}

/**
 * Mints a one-use Gemini auth token. The `name` from this response is what the phone
 * sends as `x-goog-api-key`. The long-lived key is not returned.
 * The token is not locked to a Live websocket, so the phone can call generateContent.
 */
export async function mintEphemeralToken(apiKey: string, model: string): Promise<string> {
  if (!model.trim()) {
    throw new AppError(503, "AI_UNAVAILABLE", "The assistant could not start.");
  }
  const now = Date.now();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new AppError(503, "AI_UNAVAILABLE", "The assistant could not start.");
  }
  const body = (await response.json()) as { name?: unknown };
  const token = typeof body.name === "string" ? body.name.trim() : "";
  if (!token) {
    throw new AppError(503, "AI_UNAVAILABLE", "The assistant could not start.");
  }
  return token;
}

export { DEFAULT_GEMINI_MODEL };
