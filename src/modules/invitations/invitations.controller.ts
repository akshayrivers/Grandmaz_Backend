import type { FastifyRequest, FastifyReply } from "fastify";
import { invitationsService } from "./invitations.service.js";
import { CreateInvitationSchema, GetInvitationParamsSchema } from "./invitations.schemas.js";

export class InvitationsController {
  /**
   * POST /api/invitations
   * Create and send magic link invitation to caretaker.
   */
  async createInvitation(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = CreateInvitationSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid request payload",
      });
    }

    try {
      const result = await invitationsService.createInvitation(parseResult.data);
      return reply.status(201).send({
        success: true,
        data: result.invitation,
        inviteUrl: result.inviteUrl,
      });
    } catch (err: any) {
      request.log.error({ err }, "Error creating caretaker invitation");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: err.message || "Failed to create invitation",
      });
    }
  }

  /**
   * GET /api/invitations/:token
   * Validate token and preview invitation details for Caretaker PWA.
   */
  async getInvitationDetails(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = GetInvitationParamsSchema.safeParse(request.params);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message || "Invalid token parameter",
      });
    }

    try {
      const details = await invitationsService.getInvitationDetails(parseResult.data.token);
      return reply.status(200).send({
        success: true,
        data: details,
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: err.message || "Invalid or expired invitation",
      });
    }
  }
}

export const invitationsController = new InvitationsController();
