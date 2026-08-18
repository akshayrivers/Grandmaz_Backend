import type { FastifyInstance } from "fastify";
import { deviceController } from "./device.controller.js";
import { authenticateFirebaseUser } from "../../middleware/authenticate.js";

export async function deviceRoutes(fastify: FastifyInstance) {
  // Authenticated endpoint for Caretaker PWA to list all linked devices
  fastify.get("/", { preHandler: [authenticateFirebaseUser] }, deviceController.getMyDevices);

  // Public endpoint for launcher device registration
  fastify.post("/register", deviceController.registerDevice);

  // Request a fresh challenge string for device verification
  fastify.post("/challenge", deviceController.createChallenge);

  // Verify challenge signature using registered public key
  fastify.post("/verify-signature", deviceController.verifySignature);

  // Fetch device details
  fastify.get("/:deviceId", deviceController.getDevice);
}
