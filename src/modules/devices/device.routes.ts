import type { FastifyInstance } from "fastify";
import { deviceController } from "./device.controller.js";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { PRIMARY_ONLY, WRITE_ROLES, requireDeviceAccess } from "../../middleware/authorize.js";
import { getCaretakerConfigHandler, putCaretakerConfigHandler } from "../device-config/device-config.controller.js";
import { PUBLIC_ROUTE_RATE_LIMIT } from "../../shared/constants/index.js";

export async function deviceRoutes(fastify: FastifyInstance) {
  // Public (rate-limited) launcher bootstrap: register → challenge → verify-signature.
  fastify.post("/register", { config: PUBLIC_ROUTE_RATE_LIMIT }, deviceController.registerDevice);
  fastify.post("/challenge", { config: PUBLIC_ROUTE_RATE_LIMIT }, deviceController.createChallenge);
  fastify.post("/verify-signature", { config: PUBLIC_ROUTE_RATE_LIMIT }, deviceController.verifySignature);

  // Caretaker web app
  fastify.get("/", { preHandler: [authenticateFirebaseUser] }, deviceController.getMyDevices);
  fastify.get(
    "/:deviceId",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId" })] },
    deviceController.getDevice
  );
  fastify.patch(
    "/:deviceId",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId", roles: PRIMARY_ONLY })] },
    deviceController.renameDevice
  );
  fastify.get(
    "/:deviceId/config",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId" })] },
    getCaretakerConfigHandler
  );
  fastify.put(
    "/:deviceId/config",
    { preHandler: [authenticateFirebaseUser, requireDeviceAccess({ param: "deviceId", roles: WRITE_ROLES })] },
    putCaretakerConfigHandler
  );
}
