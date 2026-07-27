import type { FastifyInstance } from "fastify";
import { invitationsController } from "./invitations.controller.js";

export async function invitationsRoutes(fastify: FastifyInstance) {
  // Public endpoint for Caretaker PWA to check invitation validity
  fastify.get("/:token", invitationsController.getInvitationDetails);

  // Endpoint to issue a new magic link invitation (from Launcher or Admin)
  fastify.post("/", invitationsController.createInvitation);
}
