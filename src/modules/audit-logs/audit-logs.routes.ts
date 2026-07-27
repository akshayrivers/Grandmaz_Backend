import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import {
  createAuditLogHandler,
  getDeviceAuditLogsHandler,
  getUserAuditLogsHandler,
} from "./audit-logs.controller.js";

export async function auditLogsRoutes(fastify: FastifyInstance) {
  fastify.post("/", { preHandler: [authenticateFirebaseUser] }, createAuditLogHandler);
  fastify.get("/device/:deviceId", { preHandler: [authenticateFirebaseUser] }, getDeviceAuditLogsHandler);
  fastify.get("/user/:userId", { preHandler: [authenticateFirebaseUser] }, getUserAuditLogsHandler);
}
