import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import {
  getDeviceCaretakersHandler,
  linkCaretakerHandler,
  removeCaretakerHandler,
  updateCaretakerRoleHandler,
} from "./caretakers.controller.js";

export async function caretakersRoutes(fastify: FastifyInstance) {
  fastify.get("/device/:deviceId", { preHandler: [authenticateFirebaseUser] }, getDeviceCaretakersHandler);
  fastify.post("/link", { preHandler: [authenticateFirebaseUser] }, linkCaretakerHandler);
  fastify.delete("/device/:deviceId/caretaker/:caretakerId", { preHandler: [authenticateFirebaseUser] }, removeCaretakerHandler);
  fastify.patch("/device/:deviceId/caretaker/:caretakerId", { preHandler: [authenticateFirebaseUser] }, updateCaretakerRoleHandler);
}
