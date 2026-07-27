import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import {
  createTaskHandler,
  getTaskByIdHandler,
  listDeviceTasksHandler,
  updateTaskStatusHandler,
} from "./commands.controller.js";

export async function commandsRoutes(fastify: FastifyInstance) {
  fastify.post("/", { preHandler: [authenticateFirebaseUser] }, createTaskHandler);
  fastify.get("/:id", { preHandler: [authenticateFirebaseUser] }, getTaskByIdHandler);
  fastify.get("/device/:deviceId", { preHandler: [authenticateFirebaseUser] }, listDeviceTasksHandler);
  fastify.patch("/:id/status", updateTaskStatusHandler); // Launcher updates status
}
