import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { queueRows } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/infra/firebase/auth.js", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

vi.mock("../../src/modules/ai/gemini-token.js", () => ({
  DEFAULT_GEMINI_MODEL: "gemini-3.8-flash",
  geminiGenerateContentUrl: (model: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
  mintEphemeralToken: vi.fn(async () => "auth_tokens/test-token"),
}));

const app = buildApp({ logger: false });
afterAll(async () => app.close());

describe("assistant session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays disabled when no Gemini key is configured", async () => {
    const previous = env.GEMINI_API_KEY;
    env.GEMINI_API_KEY = undefined;
    queueRows([{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/device/ai/session",
      headers: { authorization: "Bearer dt_valid" },
      payload: {},
    });
    env.GEMINI_API_KEY = previous;
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns a short-lived token and the device model without the API key", async () => {
    const previous = env.GEMINI_API_KEY;
    env.GEMINI_API_KEY = "test-key-not-real";
    queueRows(
      [{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }],
      []
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/device/ai/session",
      headers: { authorization: "Bearer dt_valid" },
      payload: {},
    });
    env.GEMINI_API_KEY = previous;
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.mode).toBe("text");
    expect(data.model).toBe("gemini-3.8-flash");
    expect(data.token).toBe("auth_tokens/test-token");
    expect(data.generateContentUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"
    );
    expect(JSON.stringify(res.json())).not.toContain("test-key-not-real");
    expect(data).not.toHaveProperty("reply");
  });
});
