import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Opens an assistant session for the phone. Grandma's audio is never uploaded here.
 * Without a server-side key the assistant is disabled.
 */
export async function createAiSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  getAuthenticatedDevice(request);
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new AppError(
      503,
      "AI_NOT_CONFIGURED",
      "The assistant is not available until the server has a Gemini key."
    );
  }
  return reply.send({
    success: true,
    data: {
      mode: "text",
      reply: null,
      expiresInSec: 300,
    },
  });
}
