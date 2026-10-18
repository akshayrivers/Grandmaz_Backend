import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Number("") is 0, and listen(0) asks the OS for a random port. A blank PORT
  // must stay unset so the default applies instead of binding dynamically.
  PORT: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(1).max(65535).default(3000),
  ),
  HOST: z.string().default("0.0.0.0"),

  // Database config
  DATABASE_URL: z.string().optional(),
  PGHOST: z.string().default("localhost"),
  PGPORT: z.coerce.number().default(5432),
  PGUSER: z.string().default("postgres"),
  PGPASSWORD: z.string().default("postgres"),
  PGDATABASE: z.string().default("grandma_backend"),

  // Firebase Admin Config
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // SMTP / Email Config
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Grandma's Launcher <noreply@grandmaz.app>"),

  // Caretaker web app base URL used in invitation links. CARETAKER_WEB_URL is the legacy name.
  APP_BASE_URL: z.string().url().optional(),
  CARETAKER_WEB_URL: z.string().url().optional(),

  // Comma-separated list of allowed browser origins (caretaker web app).
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  // Rate limit for public auth/pairing routes (requests per minute per IP).
  PUBLIC_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),

  // Directory for photo and voice-clip bytes. Relative paths are from the process cwd.
  MEDIA_DIR: z.string().default("data/media"),

  // Optional. Never sent to the phone. When empty, the assistant session endpoint stays disabled.
  GEMINI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", z.flattenError(parsedEnv.error).fieldErrors);
  throw new Error("Invalid environment variables");
}

const appBaseUrl = (
  parsedEnv.data.APP_BASE_URL ??
  parsedEnv.data.CARETAKER_WEB_URL ??
  "http://localhost:5173"
).replace(/\/+$/, "");

if (parsedEnv.data.NODE_ENV === "production" && !parsedEnv.data.APP_BASE_URL) {
  throw new Error("APP_BASE_URL is required in production");
}

export const env = {
  ...parsedEnv.data,
  appBaseUrl,
  corsOrigins: parsedEnv.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0),
  mediaDir: parsedEnv.data.MEDIA_DIR,
};
