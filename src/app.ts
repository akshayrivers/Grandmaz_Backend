import Fastify from "fastify";
import type { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./routes.js";
import { env } from "./config/index.js";
import { AppError, statusText } from "./shared/errors/app-error.js";

export function buildApp(options: { logger?: FastifyServerOptions["logger"] } = {}): FastifyInstance {
  const fastify = Fastify({
    logger:
      options.logger ??
      (env.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            },
          }
        : true),
  });

  // Browser access only from the configured caretaker web origins. Requests without an
  // Origin header (the Android launcher, curl) are not subject to CORS.
  const allowedOrigins = new Set(env.corsOrigins);
  fastify.register(cors, {
    origin: (origin, cb) => {
      cb(null, !origin || allowedOrigins.has(origin.replace(/\/+$/, "")));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false,
  });

  fastify.register(sensible);

  // Only routes that opt in via `config.rateLimit` are limited (see PUBLIC_ROUTE_RATE_LIMIT).
  fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: "Too Many Requests",
      message: `Rate limit exceeded, retry in ${context.after}`,
      code: "RATE_LIMITED",
    }),
  });

  fastify.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        request.log.error({ err }, "Request failed");
      }
      return reply.status(err.statusCode).send(err.toResponse());
    }

    const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err }, "Unhandled error");
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Internal server error",
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error: statusText(statusCode),
      message: err.message,
      code: typeof err.code === "string" && !err.code.startsWith("FST_") ? err.code : "BAD_REQUEST",
    });
  });

  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ statusCode: 404, error: "Not Found", message: "Route not found", code: "ROUTE_NOT_FOUND" });
  });

  fastify.register(registerRoutes);

  return fastify;
}
