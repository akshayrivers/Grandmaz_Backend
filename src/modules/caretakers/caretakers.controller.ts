import type { FastifyRequest, FastifyReply } from "fastify";
import { caretakersService } from "./caretakers.service.js";
import { linkCaretakerSchema, updateCaretakerRoleSchema } from "./caretakers.schemas.js";

export async function getDeviceCaretakersHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId } = request.params as { deviceId: string };
    const caretakers = await caretakersService.getCaretakersForDevice(deviceId);
    return reply.send(caretakers);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to fetch caretakers" });
  }
}

export async function linkCaretakerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parseResult = linkCaretakerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }
    const result = await caretakersService.linkCaretaker({
      deviceId: parseResult.data.deviceId,
      email: parseResult.data.email,
      role: parseResult.data.role,
    });
    return reply.status(201).send(result);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to link caretaker" });
  }
}

export async function removeCaretakerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId, caretakerId } = request.params as { deviceId: string; caretakerId: string };
    const success = await caretakersService.removeCaretaker(caretakerId, deviceId);
    if (!success) {
      return reply.status(404).send({ error: "Caretaker link not found" });
    }
    return reply.send({ message: "Caretaker unlinked successfully" });
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to remove caretaker" });
  }
}

export async function updateCaretakerRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { deviceId, caretakerId } = request.params as { deviceId: string; caretakerId: string };
    const parseResult = updateCaretakerRoleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }
    const success = await caretakersService.updateRole(caretakerId, deviceId, parseResult.data);
    if (!success) {
      return reply.status(404).send({ error: "Caretaker link not found" });
    }
    return reply.send({ message: "Caretaker role updated successfully" });
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to update caretaker role" });
  }
}
