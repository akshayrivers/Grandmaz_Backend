import type { FastifyRequest, FastifyReply } from "fastify";
import { commandsService } from "./commands.service.js";
import { createTaskSchema, listTasksQuerySchema, taskIdParamsSchema } from "./commands.schemas.js";
import { getDeviceAccess } from "../../middleware/authorize.js";
import { parseOrThrow } from "../../shared/errors/app-error.js";

/** POST /api/commands — primary or caretaker. */
export async function createTaskHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const body = parseOrThrow(createTaskSchema, request.body);
  const data = await commandsService.create({
    deviceUuid: access.deviceUuid,
    command: body.command,
    expiresInMinutes: body.expiresInMinutes,
    createdBy: access.userId,
  });
  return reply.status(201).send({ success: true, data });
}

/** GET /api/commands/:id */
export async function getTaskByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { id } = parseOrThrow(taskIdParamsSchema, request.params);
  const data = await commandsService.getById(id, access.deviceUuid);
  return reply.send({ success: true, data });
}

/** GET /api/commands/device/:deviceId?status= */
export async function listDeviceTasksHandler(request: FastifyRequest, reply: FastifyReply) {
  const access = getDeviceAccess(request);
  const { status } = parseOrThrow(listTasksQuerySchema, request.query);
  const data = await commandsService.listForDevice(access.deviceUuid, status);
  return reply.send({ success: true, data });
}
