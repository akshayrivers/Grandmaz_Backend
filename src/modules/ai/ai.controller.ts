import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { AppError } from "../../shared/errors/app-error.js";
import { deviceConfigService } from "../device-config/device-config.service.js";
import { DEFAULT_GEMINI_MODEL, geminiGenerateContentUrl, mintEphemeralToken } from "./gemini-token.js";

/**
 * Opens an assistant session for the phone. Grandma's audio stays on the device.
 * The response carries a short-lived Gemini token and the model id, never the API key.
 */
export async function createAiSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const key = (env.GEMINI_API_KEY ?? "").trim();
  if (!key) {
    throw new AppError(
      503,
      "AI_NOT_CONFIGURED",
      "The assistant is not available until the server has a Gemini key."
    );
  }
  const config = await deviceConfigService.get(device.uuid, device.deviceId);
  const model = config.config.voice.model || DEFAULT_GEMINI_MODEL;
  const token = await mintEphemeralToken(key, model);
  return reply.send({
    success: true,
    data: {
      mode: "text",
      model,
      token,
      expiresInSec: 60,
      generateContentUrl: geminiGenerateContentUrl(model),
    },
  });
}
