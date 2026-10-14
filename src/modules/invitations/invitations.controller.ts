import type { FastifyRequest, FastifyReply } from "fastify";
import { invitationsService } from "./invitations.service.js";
import {
  CaretakerCreateInvitationSchema,
  InvitationIdParamsSchema,
  InvitationPreviewSchema,
} from "./invitations.schemas.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";

export class InvitationsController {
  /** POST /api/invitations/preview — public; who/what an emailed link is for. */
  async preview(request: FastifyRequest, reply: FastifyReply) {
    const { token } = parseOrThrow(InvitationPreviewSchema, request.body);
    const data = await invitationsService.preview(token);
    return reply.send({ success: true, data });
  }

  /** POST /api/invitations/device/:deviceId — primary invites another caretaker. */
  async createForDevice(request: FastifyRequest, reply: FastifyReply) {
    const access = getDeviceAccess(request);
    const body = parseOrThrow(CaretakerCreateInvitationSchema, request.body);
    const data = await invitationsService.createByCaretaker({
      deviceUuid: access.deviceUuid,
      email: body.email,
      role: body.role,
      createdBy: access.userId,
    });
    return reply.status(201).send({ success: true, data });
  }

  /** GET /api/invitations/device/:deviceId */
  async listForDevice(request: FastifyRequest, reply: FastifyReply) {
    const access = getDeviceAccess(request);
    const data = await invitationsService.listForDevice(access.deviceUuid);
    return reply.send({ success: true, data });
  }

  /** DELETE /api/invitations/:id */
  async revoke(request: FastifyRequest, reply: FastifyReply) {
    const access = getDeviceAccess(request);
    const { id } = parseOrThrow(InvitationIdParamsSchema, request.params);
    await invitationsService.revoke(id, access.deviceUuid, access.userId);
    return reply.status(204).send();
  }
}

export const invitationsController = new InvitationsController();
