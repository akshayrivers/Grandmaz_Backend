import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/infra/database/migrations"
);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString });

await client.connect();
try {
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await client.query(sql);
  }
} finally {
  await client.end();
}

console.log(`Applied ${files.length} migrations`);
