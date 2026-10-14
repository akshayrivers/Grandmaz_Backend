import type { FastifyRequest, FastifyReply } from "fastify";
import { VerifyTokenSchema } from "./auth.schemas.js";
import { AcceptInvitationSchema } from "../invitations/invitations.schemas.js";
import { invitationsService } from "../invitations/invitations.service.js";
import { usersService, toUserProfile } from "../users/users.service.js";
import { verifyFirebaseIdToken } from "../../infra/firebase/auth.js";
import { AppError, parseOrThrow } from "../../shared/errors/app-error.js";
import { extractBearerToken } from "../../middleware/authenticate.js";

export class AuthController {
  /**
   * POST /api/auth/verify
   * Verifies the Firebase token (Authorization header, or `{ idToken }` body) and syncs the user.
   * Does NOT link any devices.
   */
  async verifyToken(request: FastifyRequest, reply: FastifyReply) {
    const idToken = extractBearerToken(request) ?? parseOrThrow(VerifyTokenSchema, request.body).idToken;

    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseIdToken(idToken);
    } catch {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired authentication token");
    }

    const user = await usersService.syncFromFirebase(firebaseUser);
    return reply.send({ success: true, data: toUserProfile(user, firebaseUser.emailVerified === true) });
  }

  /** GET /api/auth/me */
  async getCurrentUser(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      throw new AppError(401, "UNAUTHENTICATED", "User not authenticated");
    }
    const data = await usersService.getProfile(request.user);
    return reply.send({ success: true, data });
  }

  /** POST /api/auth/accept-invitation — Firebase-authenticated; requires the pairing code. */
  async acceptInvitation(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      throw new AppError(401, "UNAUTHENTICATED", "User not authenticated");
    }
    const { invitationToken, pairingCode } = parseOrThrow(AcceptInvitationSchema, request.body);
    const data = await invitationsService.accept(request.user, invitationToken, pairingCode);
    return reply.send({ success: true, data });
  }
}

export const authController = new AuthController();
