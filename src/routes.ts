import type { FastifyInstance } from "fastify";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { invitationsRoutes } from "./modules/invitations/invitations.routes.js";
import { deviceRoutes } from "./modules/devices/device.routes.js";
import { userRoutes } from "./modules/users/users.routes.js";
import { caretakersRoutes } from "./modules/caretakers/caretakers.route.js";
import { commandsRoutes } from "./modules/commands/commands.routes.js";
import { sharedStateRoutes } from "./modules/shared-state/shared-state.routes.js";
import { helpRequestsRoutes } from "./modules/help-requests/help-requests.routes.js";
import { auditLogsRoutes } from "./modules/audit-logs/audit-logs.routes.js";

export async function registerRoutes(fastify: FastifyInstance) {
  // Core Auth & Identity routes
  fastify.register(authRoutes, { prefix: "/api/auth" });
  fastify.register(userRoutes, { prefix: "/api/users" });

  // Invitations & Caretakers
  fastify.register(invitationsRoutes, { prefix: "/api/invitations" });
  fastify.register(caretakersRoutes, { prefix: "/api/caretakers" });

  // Devices & Remote Execution
  fastify.register(deviceRoutes, { prefix: "/api/devices" });
  fastify.register(commandsRoutes, { prefix: "/api/commands" });
  fastify.register(sharedStateRoutes, { prefix: "/api/shared-state" });
  fastify.register(helpRequestsRoutes, { prefix: "/api/help-requests" });
  fastify.register(auditLogsRoutes, { prefix: "/api/audit-logs" });

  // Health check endpoint
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
