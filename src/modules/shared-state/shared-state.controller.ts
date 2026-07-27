import type { FastifyRequest, FastifyReply } from "fastify";
import { sharedStateService } from "./shared-state.service.js";
import { postSnapshotSchema } from "./shared-state.schemas.js";

export async function postSnapshotHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parseResult = postSnapshotSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const snapshot = await sharedStateService.recordSnapshot({
      deviceId: parseResult.data.deviceId,
      batteryLevel: parseResult.data.batteryLevel,
      batteryStatus: parseResult.data.batteryStatus,
      wifiSsid: parseResult.data.wifiSsid,
      storageFreeMb: parseResult.data.storageFreeMb,
      installedApps: parseResult.data.installedApps,
      settings: parseResult.data.settings,
      snapshotData: parseResult.data.snapshotData,
    });
    return reply.status(201).send(snapshot);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to record device state snapshot" });
  }
}

export async function getLatestSnapshotHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId } = request.params as { deviceId: string };
    const snapshot = await sharedStateService.getLatest(deviceId);
    if (!snapshot) {
      return reply.status(404).send({ error: "No snapshot found for device" });
    }
    return reply.send(snapshot);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to fetch device state" });
  }
}

export async function getSnapshotHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId } = request.params as { deviceId: string };
    const { limit } = request.query as { limit?: string };
    const history = await sharedStateService.getHistory(deviceId, limit ? parseInt(limit, 10) : 20);
    return reply.send(history);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to fetch snapshot history" });
  }
}
