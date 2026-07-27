import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { query } from "../client.js";

export * from "./users.queries.js";
export * from "./devices.queries.js";
export * from "./device_caretakers.queries.js";
export * from "./caretaker_invitations.queries.js";
export * from "./help_requests.queries.js";
export * from "./tasks.queries.js";
export * from "./audit_logs.queries.js";
export * from "./device_state_snapshots.queries.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initializes the full database schema by running the DDL script in schema.sql.
 */
export async function initializeSchema(): Promise<void> {
  const schemaPath = join(__dirname, "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");
  await query(schemaSql);
}
