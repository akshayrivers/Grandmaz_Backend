import type { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";

export async function authRoutes(fastify: FastifyInstance) {
  // Public route: verify token passed in request body
  fastify.post("/verify", authController.verifyToken);

  // Public route: accept invitation with Firebase token + invitation token
  fastify.post("/accept-invitation", authController.acceptInvitation);

  // Protected route: get current authenticated user profile
  fastify.get("/me", { preHandler: [authenticateFirebaseUser] }, authController.getCurrentUser);
}
