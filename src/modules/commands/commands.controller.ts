import type { FastifyRequest, FastifyReply } from "fastify";
import { commandsService } from "./commands.service.js";
import { createTaskSchema, updateTaskStatusSchema } from "./commands.schemas.js";
import { findUserByFirebaseUid } from "../../infra/database/queries/users.queries.js";

export async function createTaskHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parseResult = createTaskSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    let createdBy: string | undefined = undefined;
    if (request.user?.uid) {
      const user = await findUserByFirebaseUid(request.user.uid);
      if (user) {
        createdBy = user.id;
      }
    }

    const task = await commandsService.create({
      deviceId: parseResult.data.deviceId,
      title: parseResult.data.title,
      command: parseResult.data.command,
      description: parseResult.data.description,
      payload: parseResult.data.payload,
      scheduledAt: parseResult.data.scheduledAt ? new Date(parseResult.data.scheduledAt) : undefined,
      createdBy,
    });
    return reply.status(201).send(task);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to create remote task" });
  }
}

export async function getTaskByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const task = await commandsService.getById(id);
    return reply.send(task);
  } catch (err: any) {
    return reply.status(404).send({ error: err.message || "Task not found" });
  }
}

export async function listDeviceTasksHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId } = request.params as { deviceId: string };
    const { status } = request.query as { status?: string };
    const tasks = await commandsService.listForDevice(deviceId, status);
    return reply.send(tasks);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to list tasks" });
  }
}

export async function updateTaskStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const parseResult = updateTaskStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const updatedTask = await commandsService.updateStatus(id, parseResult.data);
    return reply.send(updatedTask);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to update task status" });
  }
}
