import type { FastifyRequest, FastifyReply } from "fastify";
import { helpRequestsService } from "./help-requests.service.js";
import { createHelpRequestSchema, resolveHelpRequestSchema } from "./help-requests.schemas.js";
import { findUserByFirebaseUid } from "../../infra/database/queries/users.queries.js";

export async function createHelpRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parseResult = createHelpRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const helpRequest = await helpRequestsService.create({
      deviceId: parseResult.data.deviceId,
      title: parseResult.data.title,
      description: parseResult.data.description,
      type: parseResult.data.type,
    });
    return reply.status(201).send(helpRequest);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to create help request" });
  }
}

export async function listHelpRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId } = request.params as { deviceId: string };
    const requests = await helpRequestsService.listForDevice(deviceId);
    return reply.send(requests);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to fetch help requests" });
  }
}

export async function resolveHelpRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const parseResult = resolveHelpRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    let resolvedBy: string | undefined = undefined;
    if (request.user?.uid) {
      const user = await findUserByFirebaseUid(request.user.uid);
      if (user) {
        resolvedBy = user.id;
      }
    }

    const updated = await helpRequestsService.updateStatus(id, {
      status: parseResult.data.status,
      resolvedBy,
    });
    return reply.send(updated);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to update help request" });
  }
}
