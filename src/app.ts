import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { registerRoutes } from "./routes.js";

export function buildApp(): FastifyInstance {
  const fastify = Fastify({
    logger:
      process.env.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            },
          }
        : true,
  });

  // Register Core Plugins
  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  fastify.register(sensible);

  // Register Routes
  fastify.register(registerRoutes);

  return fastify;
}
