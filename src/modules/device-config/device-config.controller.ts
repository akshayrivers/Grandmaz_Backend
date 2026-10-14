import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";
import { DeviceConfigSchema, parseIfMatchVersion } from "./device-config.schemas.js";
import { deviceConfigService } from "./device-config.service.js";
import type { DeviceConfigRecord } from "./device-config.types.js";

function readExpectedVersion(request: FastifyRequest): number {
  return parseIfMatchVersion(request.headers["if-match"]);
}

function sendConfig(reply: FastifyReply, data: DeviceConfigRecord) {
  reply.header("etag", `"${data.version}"`);
  return reply.send({ success: true, data });
}

/** GET /api/device/config — device token. */
export async function getDeviceConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const data = await deviceConfigService.get(device.uuid, device.deviceId);
  return sendConfig(reply, data);
}

/** PUT /api/device/config — device token, If-Match version. */
export async function putDeviceConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const expectedVersion = readExpectedVersion(request);
  const config = parseOrThrow(DeviceConfigSchema, request.body);
  const data = await deviceConfigService.save({
    deviceUuid: device.uuid,
    deviceId: device.deviceId,
    expectedVersion,
    config,
    updatedByUser: null,
    updatedByDevice: device.uuid,
  });
  return sendConfig(reply, data);
}

/** GET /api/devices/:deviceId/config — any linked caretaker role. */
export async function getCaretakerConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const data = await deviceConfigService.get(access.deviceUuid, access.deviceId);
  return sendConfig(reply, data);
}

/** PUT /api/devices/:deviceId/config — primary or caretaker, If-Match version. */
export async function putCaretakerConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const expectedVersion = readExpectedVersion(request);
  const config = parseOrThrow(DeviceConfigSchema, request.body);
  const data = await deviceConfigService.save({
    deviceUuid: access.deviceUuid,
    deviceId: access.deviceId,
    expectedVersion,
    config,
    updatedByUser: access.userId,
    updatedByDevice: null,
  });
  return sendConfig(reply, data);
}
