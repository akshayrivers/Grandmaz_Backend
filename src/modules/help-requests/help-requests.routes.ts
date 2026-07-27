import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import {
  createHelpRequestHandler,
  listHelpRequestsHandler,
  resolveHelpRequestHandler,
} from "./help-requests.controller.js";

export async function helpRequestsRoutes(fastify: FastifyInstance) {
  fastify.post("/", createHelpRequestHandler); // Can be raised from launcher or caretaker
  fastify.get("/device/:deviceId", { preHandler: [authenticateFirebaseUser] }, listHelpRequestsHandler);
  fastify.patch("/:id/resolve", { preHandler: [authenticateFirebaseUser] }, resolveHelpRequestHandler);
}
