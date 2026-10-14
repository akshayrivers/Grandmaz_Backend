import type { FastifyInstance } from "fastify";
import { deviceController } from "./device.controller.js";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";
import { PRIMARY_ONLY, requireDeviceAccess } from "../../middleware/authorize.js";
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
}
