import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import {
  postSnapshotHandler,
  getLatestSnapshotHandler,
  getSnapshotHistoryHandler,
} from "./shared-state.controller.js";

export async function sharedStateRoutes(fastify: FastifyInstance) {
  fastify.post("/snapshot", postSnapshotHandler); // Device posts state snapshot
  fastify.get("/device/:deviceId/latest", { preHandler: [authenticateFirebaseUser] }, getLatestSnapshotHandler);
  fastify.get("/device/:deviceId/history", { preHandler: [authenticateFirebaseUser] }, getSnapshotHistoryHandler);
}
