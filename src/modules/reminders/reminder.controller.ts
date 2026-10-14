import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedDevice } from "../../middleware/authenticate-device.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";
import { reportReminderSchema } from "./reminder.schemas.js";
import { reminderService } from "./reminder.service.js";

export async function reportReminderHandler(request: FastifyRequest, reply: FastifyReply) {
  const device = getAuthenticatedDevice(request);
  const body = parseOrThrow(reportReminderSchema, request.body ?? {});
  const data = await reminderService.report(device.uuid, body.reminderId, body.status);
  return reply.status(201).send({ success: true, data });
}

export async function listRemindersHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const data = await reminderService.list(access.deviceUuid);
  return reply.send({ success: true, data });
}
