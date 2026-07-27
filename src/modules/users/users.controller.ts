import type { FastifyRequest, FastifyReply } from "fastify";
import { usersService } from "./users.service.js";
import { updateUserProfileSchema } from "./users.schemas.js";

export async function getProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const profile = await usersService.getProfileByFirebaseUid(request.user.uid);
    return reply.send(profile);
  } catch (err: any) {
    return reply.status(404).send({ error: err.message || "User profile not found" });
  }
}

export async function updateProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const parseResult = updateUserProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const updatedProfile = await usersService.updateProfile(request.user.uid, {
      name: parseResult.data.name,
      avatarUrl: parseResult.data.avatarUrl,
    });
    return reply.send(updatedProfile);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message || "Failed to update user profile" });
  }
}
