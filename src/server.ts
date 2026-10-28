import { buildApp } from "./app.js";
import { env } from "./config/index.js";
import { assertLocalFlowAllowed, localFlowEnabled } from "./config/local-flow.js";
import { seedLocalFlow } from "./local-flow/seed.js";

assertLocalFlowAllowed();

const app = buildApp();

async function start() {
  try {
    if (localFlowEnabled()) {
      await seedLocalFlow();
      app.log.info("Local flow seed ready");
    }
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 Server running on ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();