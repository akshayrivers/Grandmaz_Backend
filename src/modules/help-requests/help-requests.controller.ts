import type { FastifyRequest, FastifyReply } from "fastify";
import { helpRequestsService } from "./help-requests.service.js";
import { helpRequestIdParamsSchema, resolveHelpRequestSchema } from "./help-requests.schemas.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";

/** GET /api/help-requests/device/:deviceId — any linked role. */
export async function listHelpRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const data = await helpRequestsService.listForDevice(access.deviceUuid);
  return reply.send({ success: true, data });
}

/** PATCH /api/help-requests/:id/resolve — primary or caretaker. */
export async function resolveHelpRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { id } = parseOrThrow(helpRequestIdParamsSchema, request.params);
  const { status } = parseOrThrow(resolveHelpRequestSchema, request.body);
  const data = await helpRequestsService.updateStatus(id, access.deviceUuid, {
    status,
    resolvedBy: access.userId,
  });
  return reply.send({ success: true, data });
}
