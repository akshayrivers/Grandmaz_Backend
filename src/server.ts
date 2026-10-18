import { buildApp } from "./app.js";
import { env } from "./config/index.js";

const app = buildApp();

async function start() {
  try {
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 Server running on ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();