import type { FastifyRequest, FastifyReply } from "fastify";
import { authService } from "./auth.service.js";
import { VerifyTokenSchema, AcceptInvitationSchema } from "./auth.schemas.js";

export class AuthController {
  /**
   * POST /api/auth/verify
   * Verifies Firebase token passed in body or Auth header and syncs user to Postgres.
   */
  async verifyToken(request: FastifyRequest, reply: FastifyReply) {
    let firebaseUser = request.user;

    if (!firebaseUser) {
      const parseResult = VerifyTokenSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message || "Invalid request payload",
        });
      }
      const { idToken } = parseResult.data;
      const { verifyFirebaseIdToken } = await import("../../infra/firebase/auth.js");
      firebaseUser = await verifyFirebaseIdToken(idToken);
    }

    const userProfile = await authService.verifyAndSyncUser(firebaseUser);
    return reply.status(200).send({
      success: true,
      data: userProfile,
    });
  }

  /**
   * GET /api/auth/me
   * Returns current authenticated caretaker profile.
   */
  async getCurrentUser(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "User not authenticated",
      });
    }

    const userProfile = await authService.verifyAndSyncUser(request.user);
    return reply.status(200).send({
      success: true,
      data: userProfile,
    });
  }

  /**
   * POST /api/auth/accept-invitation
   * Caretaker magic link acceptance endpoint.
   */
  async acceptInvitation(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = AcceptInvitationSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid request payload",
      });
    }

    const { idToken, invitationToken } = parseResult.data;

    try {
      const result = await authService.acceptInvitation(idToken, invitationToken);
      return reply.status(200).send({
        success: true,
        ...result,
      });
    } catch (err: any) {
      request.log.error({ err }, "Error accepting caretaker invitation");
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to accept invitation",
      });
    }
  }
}

export const authController = new AuthController();
