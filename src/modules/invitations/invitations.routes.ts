import type { FastifyInstance, FastifyRequest } from "fastify";
import { invitationsController } from "./invitations.controller.js";
import { invitationsService } from "./invitations.service.js";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { PRIMARY_ONLY, requireDeviceAccess } from "../../middleware/authorize.js";
import { PUBLIC_ROUTE_RATE_LIMIT } from "../../shared/constants/index.js";
import { InvitationIdParamsSchema } from "./invitations.schemas.js";

async function deviceForInvitation(request: FastifyRequest): Promise<string | null> {
  const parsed = InvitationIdParamsSchema.safeParse(request.params);
  return parsed.success ? invitationsService.findDeviceUuidForInvitation(parsed.data.id) : null;
}

export async function invitationsRoutes(fastify: FastifyInstance) {
  fastify.post("/preview", { config: PUBLIC_ROUTE_RATE_LIMIT }, invitationsController.preview);

  const primaryOfDevice = requireDeviceAccess({ param: "deviceId", roles: PRIMARY_ONLY });
  fastify.post(
    "/device/:deviceId",
    { preHandler: [authenticateFirebaseUser, primaryOfDevice] },
    invitationsController.createForDevice
  );
  fastify.get(
    "/device/:deviceId",
    { preHandler: [authenticateFirebaseUser, primaryOfDevice] },
    invitationsController.listForDevice
  );
  fastify.delete(
    "/:id",
    {
      preHandler: [
        authenticateFirebaseUser,
        requireDeviceAccess({ resolve: deviceForInvitation, notFoundCode: "INVITATION_NOT_FOUND", roles: PRIMARY_ONLY }),
      ],
    },
    invitationsController.revoke
  );
}
