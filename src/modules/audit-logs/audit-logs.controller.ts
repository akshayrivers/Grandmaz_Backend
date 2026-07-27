import type { FastifyRequest, FastifyReply } from "fastify";
import { auditLogsService } from "./audit-logs.service.js";
import { createAuditLogSchema } from "./audit-logs.schemas.js";

export async function createAuditLogHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parseResult = createAuditLogSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const log = await auditLogsService.log({
      action: parseResult.data.action,
      deviceId: parseResult.data.deviceId,
      userId: parseResult.data.userId,
      details: parseResult.data.details,
      ipAddress: request.ip,
    });
    return reply.status(201).send(log);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to create audit log" });
  }
}

export async function getDeviceAuditLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId } = request.params as { deviceId: string };
    const logs = await auditLogsService.listForDevice(deviceId);
    return reply.send(logs);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to fetch device audit logs" });
  }
}

export async function getUserAuditLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId } = request.params as { userId: string };
    const logs = await auditLogsService.listForUser(userId);
    return reply.send(logs);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to fetch user audit logs" });
  }
}
