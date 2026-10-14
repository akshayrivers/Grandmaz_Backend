import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { requireDeviceAccess, WRITE_ROLES } from "../../middleware/authorize.js";
import { ackSosHandler, listSosHandler } from "./sos.controller.js";
import { sosService } from "./sos.service.js";
import { sosEventParamsSchema } from "./sos.schemas.js";

async function deviceForSos(request: FastifyRequest): Promise<string | null> {
  const parsed = sosEventParamsSchema.safeParse(request.params);
  return parsed.success ? sosService.findDeviceUuid(parsed.data.id) : null;
}

export async function sosRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/device/:deviceId",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId" })] },
    listSosHandler
  );
  fastify.post(
    "/:id/ack",
    {
      preHandler: [
        authenticateFirebaseUser,
        requireDeviceAccess({ resolve: deviceForSos, notFoundCode: "SOS_NOT_FOUND", roles: WRITE_ROLES }),
      ],
    },
    ackSosHandler
  );
}
