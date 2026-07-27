import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { getProfileHandler, updateProfileHandler } from "./users.controller.js";

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/me", { preHandler: [authenticateFirebaseUser] }, getProfileHandler);
  fastify.patch("/me", { preHandler: [authenticateFirebaseUser] }, updateProfileHandler);
}
