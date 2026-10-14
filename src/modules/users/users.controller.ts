import type { FastifyRequest, FastifyReply } from "fastify";
import { usersService } from "./users.service.js";
import { updateUserProfileSchema } from "./users.schemas.js";
import { getCurrentUser } from "../../middleware/authenticate.js";
import { AppError } from "../../shared/errors/app-error.js";

export async function getProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    throw new AppError(401, "UNAUTHENTICATED", "User not authenticated");
  }
  const profile = await usersService.getProfile(request.user);
  return reply.send({ success: true, data: profile });
}

export async function updateProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = updateUserProfileSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    const phoneIssue = parsed.error.issues.find((issue) => issue.path[0] === "phoneE164");
    throw new AppError(
      400,
      phoneIssue ? "INVALID_PHONE" : "VALIDATION_ERROR",
      (phoneIssue ?? parsed.error.issues[0])?.message ?? "Invalid request payload"
    );
  }

  const user = await getCurrentUser(request);
  const profile = await usersService.updateProfile(user, request.user?.emailVerified === true, {
    name: parsed.data.name,
    phoneE164: parsed.data.phoneE164,
  });
  return reply.send({ success: true, data: profile });
}
