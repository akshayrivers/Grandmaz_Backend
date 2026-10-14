import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyFirebaseIdToken } from "../infra/firebase/auth.js";
import type { AuthenticatedUser } from "../infra/firebase/types.js";
import type { UserRow } from "../infra/database/queries/users.queries.js";
import { AppError } from "../shared/errors/app-error.js";
import { usersService } from "../modules/users/users.service.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    currentUser?: UserRow;
  }
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Fastify preHandler hook to verify Firebase ID Token in Authorization header.
 * Expects header: Authorization: Bearer <token>
 */
export async function authenticateFirebaseUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const idToken = extractBearerToken(request);
  if (!idToken) {
    throw new AppError(401, "UNAUTHENTICATED", "Missing or malformed Authorization header. Expected Bearer token.");
  }

  try {
    request.user = await verifyFirebaseIdToken(idToken);
  } catch (error) {
    request.log.warn({ err: error }, "Firebase token verification failed");
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired authentication token");
  }
}

/**
 * Resolves (and lazily syncs) the Postgres user row for the authenticated Firebase user.
 * Must run after `authenticateFirebaseUser`.
 */
export async function getCurrentUser(request: FastifyRequest): Promise<UserRow> {
  if (request.currentUser) {
    return request.currentUser;
  }
  if (!request.user) {
    throw new AppError(401, "UNAUTHENTICATED", "User not authenticated");
  }
  request.currentUser = await usersService.syncFromFirebase(request.user);
  return request.currentUser;
}
