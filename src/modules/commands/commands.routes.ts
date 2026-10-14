import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { requireDeviceAccess, WRITE_ROLES } from "../../middleware/authorize.js";
import { createTaskHandler, getTaskByIdHandler, listDeviceTasksHandler } from "./commands.controller.js";
import { commandsService } from "./commands.service.js";
import { taskIdParamsSchema } from "./commands.schemas.js";

async function deviceForTask(request: FastifyRequest): Promise<string | null> {
  const parsed = taskIdParamsSchema.safeParse(request.params);
  return parsed.success ? commandsService.findDeviceUuidForTask(parsed.data.id) : null;
}

export async function commandsRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ bodyField: "deviceId", roles: WRITE_ROLES })] },
    createTaskHandler
  );
  fastify.get(
    "/device/:deviceId",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId" })] },
    listDeviceTasksHandler
  );
  fastify.get(
    "/:id",
    {
      preHandler: [
        authenticateFirebaseUser,
        requireDeviceAccess({ resolve: deviceForTask, notFoundCode: "COMMAND_NOT_FOUND" }),
      ],
    },
    getTaskByIdHandler
  );
}
