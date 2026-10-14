import type { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { PUBLIC_ROUTE_RATE_LIMIT } from "../../shared/constants/index.js";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/verify", { config: PUBLIC_ROUTE_RATE_LIMIT }, authController.verifyToken);

  fastify.post(
    "/accept-invitation",
    { config: PUBLIC_ROUTE_RATE_LIMIT, preHandler: [authenticateFirebaseUser] },
    authController.acceptInvitation
  );

  fastify.get("/me", { preHandler: [authenticateFirebaseUser] }, authController.getCurrentUser);
}
