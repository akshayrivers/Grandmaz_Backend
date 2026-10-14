import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { requireDeviceAccess, WRITE_ROLES } from "../../middleware/authorize.js";
import { listHelpRequestsHandler, resolveHelpRequestHandler } from "./help-requests.controller.js";
import { helpRequestsService } from "./help-requests.service.js";
import { helpRequestIdParamsSchema } from "./help-requests.schemas.js";

async function deviceForHelpRequest(request: FastifyRequest): Promise<string | null> {
  const parsed = helpRequestIdParamsSchema.safeParse(request.params);
  return parsed.success ? helpRequestsService.findDeviceUuidForRequest(parsed.data.id) : null;
}

export async function helpRequestsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/device/:deviceId",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId" })] },
    listHelpRequestsHandler
  );
  fastify.patch(
    "/:id/resolve",
    {
      preHandler: [
        authenticateFirebaseUser,
        requireDeviceAccess({
          resolve: deviceForHelpRequest,
          notFoundCode: "HELP_REQUEST_NOT_FOUND",
          roles: WRITE_ROLES,
        }),
      ],
    },
    resolveHelpRequestHandler
  );
}
