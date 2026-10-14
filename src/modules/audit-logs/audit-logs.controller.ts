import type { FastifyRequest, FastifyReply } from "fastify";
import { auditLogsService } from "./audit-logs.service.js";
import { getDeviceAccess } from "../../middleware/authorize.js";

export async function getDeviceAuditLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const logs = await auditLogsService.listForDevice(access.deviceUuid);
  return reply.send({ success: true, data: logs });
}
