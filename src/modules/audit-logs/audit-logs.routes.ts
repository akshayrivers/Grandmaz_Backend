import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { requireDeviceAccess } from "../../middleware/authorize.js";
import { getDeviceAuditLogsHandler } from "./audit-logs.controller.js";

export async function auditLogsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/device/:deviceId",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId" })] },
    getDeviceAuditLogsHandler
  );
}
