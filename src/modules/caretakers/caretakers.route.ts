import type { FastifyInstance } from "fastify";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { PRIMARY_ONLY, requireDeviceAccess } from "../../middleware/authorize.js";
import {
  getDeviceCaretakersHandler,
  removeCaretakerHandler,
  transferPrimaryHandler,
  updateCaretakerRoleHandler,
} from "./caretakers.controller.js";

export async function caretakersRoutes(fastify: FastifyInstance) {
  const anyRole = requireDeviceAccess({ param: "deviceId" });
  const primaryOnly = requireDeviceAccess({ param: "deviceId", roles: PRIMARY_ONLY });

  fastify.get("/device/:deviceId", { preHandler: [authenticateFirebaseUser, anyRole] }, getDeviceCaretakersHandler);
  fastify.post(
    "/device/:deviceId/transfer-primary",
    { preHandler: [authenticateFirebaseUser, primaryOnly] },
    transferPrimaryHandler
  );
  fastify.patch(
    "/device/:deviceId/caretaker/:caretakerId",
    { preHandler: [authenticateFirebaseUser, primaryOnly] },
    updateCaretakerRoleHandler
  );
  fastify.delete(
    "/device/:deviceId/caretaker/:caretakerId",
    { preHandler: [authenticateFirebaseUser, primaryOnly] },
    removeCaretakerHandler
  );
}
