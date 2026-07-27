import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyFirebaseIdToken } from "../infra/firebase/auth.js";
import type { AuthenticatedUser } from "../infra/firebase/types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Fastify preHandler hook to verify Firebase ID Token in Authorization header.
 * Expects header: Authorization: Bearer <token>
 */
export async function authenticateFirebaseUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Missing or malformed Authorization header. Expected Bearer token.",
    });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1]?.trim();

  if (!idToken) {
    reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Bearer token missing",
    });
    return;
  }

  try {
    const authenticatedUser = await verifyFirebaseIdToken(idToken);
    request.user = authenticatedUser;
  } catch (error: any) {
    request.log.error({ err: error }, "Firebase token verification failed");
    reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid or expired authentication token",
    });
  }
}
