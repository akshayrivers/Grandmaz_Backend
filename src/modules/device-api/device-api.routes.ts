import type { FastifyInstance } from "fastify";
import { authenticateDevice } from "../../middleware/authenticate-device.js";
import {
  createHelpRequestHandler,
  createInvitationHandler,
  getInvitationStatusHandler,
  getSelfHandler,
  listCommandsHandler,
  postSnapshotHandler,
  putPushTokenHandler,
  updateCommandStatusHandler,
} from "./device-api.controller.js";
import { getDeviceConfigHandler, putDeviceConfigHandler } from "../device-config/device-config.controller.js";
import { getDeviceMediaHandler, mediaBodyLimit, postDeviceMediaHandler } from "../media/media.controller.js";

/**
 * Launcher-facing routes. Every route requires a device token (`Bearer dt_…`); the device is
 * implied by the token, and resources by id are checked to belong to it in the service layer.
 */
export async function deviceApiRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticateDevice);

  fastify.get("/me", getSelfHandler);
  fastify.get("/config", getDeviceConfigHandler);
  fastify.put("/config", putDeviceConfigHandler);
  fastify.post("/media", { ...mediaBodyLimit }, postDeviceMediaHandler);
  fastify.get("/media/:assetId", getDeviceMediaHandler);
  fastify.post("/invitations", createInvitationHandler);
  fastify.get("/invitations/:id", getInvitationStatusHandler);
  fastify.put("/push-token", putPushTokenHandler);
  fastify.get("/commands", listCommandsHandler);
  fastify.patch("/commands/:id/status", updateCommandStatusHandler);
  fastify.post("/snapshot", postSnapshotHandler);
  fastify.post("/help-requests", createHelpRequestHandler);
}
