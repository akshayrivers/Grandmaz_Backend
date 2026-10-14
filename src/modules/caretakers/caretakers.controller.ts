import type { FastifyRequest, FastifyReply } from "fastify";
import { caretakersService } from "./caretakers.service.js";
import { caretakerParamsSchema, transferPrimarySchema, updateCaretakerRoleSchema } from "./caretakers.schemas.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";

/** GET /api/caretakers/device/:deviceId — any linked role. */
export async function getDeviceCaretakersHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const data = await caretakersService.listForDevice(access.deviceUuid, access.userId);
  return reply.send({ success: true, data });
}

/** PATCH /api/caretakers/device/:deviceId/caretaker/:caretakerId — primary only. */
export async function updateCaretakerRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { caretakerId } = parseOrThrow(caretakerParamsSchema, request.params);
  const { role } = parseOrThrow(updateCaretakerRoleSchema, request.body);
  const data = await caretakersService.changeRole({
    deviceUuid: access.deviceUuid,
    actorId: access.userId,
    caretakerId,
    role,
  });
  return reply.send({ success: true, data });
}

/** POST /api/caretakers/device/:deviceId/transfer-primary — primary only. */
export async function transferPrimaryHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { caretakerId } = parseOrThrow(transferPrimarySchema, request.body);
  const data = await caretakersService.transferPrimary({
    deviceUuid: access.deviceUuid,
    actorId: access.userId,
    caretakerId,
  });
  return reply.send({ success: true, data });
}

/** DELETE /api/caretakers/device/:deviceId/caretaker/:caretakerId — primary only. */
export async function removeCaretakerHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { caretakerId } = parseOrThrow(caretakerParamsSchema, request.params);
  await caretakersService.remove({ deviceUuid: access.deviceUuid, actorId: access.userId, caretakerId });
  return reply.status(204).send();
}
