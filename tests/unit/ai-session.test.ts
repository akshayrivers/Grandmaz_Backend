import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { queueRows } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/infra/firebase/auth.js", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

const app = buildApp({ logger: false });
afterAll(async () => app.close());

describe("assistant session", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stays disabled when no Gemini key is configured", async () => {
    queueRows([{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/device/ai/session",
      headers: { authorization: "Bearer dt_valid" },
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("AI_NOT_CONFIGURED");
  });
});
