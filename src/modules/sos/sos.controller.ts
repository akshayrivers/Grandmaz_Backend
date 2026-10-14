import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";
import { sosEventParamsSchema, sosLocationSchema, startSosSchema } from "./sos.schemas.js";
import { sosService } from "./sos.service.js";

export async function startSosHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const body = parseOrThrow(startSosSchema, request.body ?? {});
  const data = await sosService.start(device.uuid, body);
  return reply.status(201).send({ success: true, data });
}

export async function postSosLocationHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { id } = parseOrThrow(sosEventParamsSchema, request.params);
  const body = parseOrThrow(sosLocationSchema, request.body);
  const data = await sosService.addLocation(device.uuid, id, body);
  return reply.send({ success: true, data });
}

export async function cancelSosHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const { id } = parseOrThrow(sosEventParamsSchema, request.params);
  const data = await sosService.cancel(device.uuid, id);
  return reply.send({ success: true, data });
}

export async function listSosHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const data = await sosService.list(access.deviceUuid);
  return reply.send({ success: true, data });
}

export async function ackSosHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { id } = parseOrThrow(sosEventParamsSchema, request.params);
  const data = await sosService.acknowledge(access.deviceUuid, id, access.userId);
  return reply.send({ success: true, data });
}
