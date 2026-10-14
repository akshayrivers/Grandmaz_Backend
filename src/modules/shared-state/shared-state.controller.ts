import type { FastifyRequest, FastifyReply } from "fastify";
import { sharedStateService } from "./shared-state.service.js";
import { snapshotHistoryQuerySchema } from "./shared-state.schemas.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";

/** GET /api/shared-state/device/:deviceId/latest — `data` is null when no snapshot exists yet. */
export async function getLatestSnapshotHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const data = await sharedStateService.getLatest(access.deviceUuid);
  return reply.send({ success: true, data });
}

/** GET /api/shared-state/device/:deviceId/history?limit= */
export async function getSnapshotHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { limit } = parseOrThrow(snapshotHistoryQuerySchema, request.query);
  const data = await sharedStateService.getHistory(access.deviceUuid, limit);
  return reply.send({ success: true, data });
}
