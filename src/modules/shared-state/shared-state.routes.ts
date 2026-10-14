import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { requireDeviceAccess } from "../../middleware/authorize.js";
import { getLatestSnapshotHandler, getSnapshotHistoryHandler } from "./shared-state.controller.js";

export async function sharedStateRoutes(fastify: FastifyInstance) {
  const anyRole = requireDeviceAccess({ param: "deviceId" });
  fastify.get("/device/:deviceId/latest", { preHandler: [authenticateFirebaseUser, anyRole] }, getLatestSnapshotHandler);
  fastify.get("/device/:deviceId/history", { preHandler: [authenticateFirebaseUser, anyRole] }, getSnapshotHistoryHandler);
}
