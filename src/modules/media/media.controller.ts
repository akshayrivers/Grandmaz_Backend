import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";
import { assetIdParamsSchema, uploadMediaSchema } from "./media.schemas.js";
import { mediaService } from "./media.service.js";

const MEDIA_BODY_LIMIT = 8 * 1024 * 1024;

export const mediaBodyLimit = { bodyLimit: MEDIA_BODY_LIMIT };

async function upload(
  request: FastifyRequest,
  reply: FastifyReply,
  actor: { deviceUuid: string; createdByUser: string | null; createdByDevice: string | null }
) {
  const body = parseOrThrow(uploadMediaSchema, request.body);
  const data = await mediaService.save({
    deviceUuid: actor.deviceUuid,
    kind: body.kind,
    contentType: body.contentType,
    dataBase64: body.dataBase64,
    durationMs: body.durationMs,
    createdByUser: actor.createdByUser,
    createdByDevice: actor.createdByDevice,
  });
  return reply.status(201).send({ success: true, data });
}

async function download(reply: FastifyReply, deviceUuid: string, assetId: string) {
  const { row, bytes } = await mediaService.read(deviceUuid, assetId);
  return reply.type(row.content_type).header("cache-control", "private, max-age=3600").send(bytes);
}

/** POST /api/device/media */
export async function postDeviceMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  return upload(request, reply, { deviceUuid: device.uuid, createdByUser: null, createdByDevice: device.uuid });
}

/** GET /api/device/media/:assetId */
export async function getDeviceMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { assetId } = parseOrThrow(assetIdParamsSchema, request.params);
  return download(reply, device.uuid, assetId);
}

/** POST /api/devices/:deviceId/media */
export async function postCaretakerMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  return upload(request, reply, {
    deviceUuid: access.deviceUuid,
    createdByUser: access.userId,
    createdByDevice: null,
  });
}

/** GET /api/devices/:deviceId/media/:assetId */
export async function getCaretakerMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { assetId } = parseOrThrow(assetIdParamsSchema, request.params);
  return download(reply, access.deviceUuid, assetId);
}
