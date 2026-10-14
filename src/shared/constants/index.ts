import { env } from "../../config/index.js";

/** Route `config` for public (unauthenticated) auth/pairing routes; read by @fastify/rate-limit. */
export const PUBLIC_ROUTE_RATE_LIMIT = {
  rateLimit: {
    max: env.PUBLIC_RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
  },
} as const;
