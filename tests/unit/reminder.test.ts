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

describe("medicine reminder log", () => {
  beforeEach(() => vi.resetAllMocks());

  it("records a taken reminder for the device token", async () => {
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      device_id: "dev-uuid-1",
      device_string_id: "dev-1",
      reminder_id: "morning",
      status: "taken",
      occurred_at: new Date("2026-10-15T08:00:00.000Z"),
    };
    queueRows(
      [{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }],
      [row],
      []
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/device/reminders/events",
      headers: { authorization: "Bearer dt_valid" },
      payload: { reminderId: "morning", status: "taken" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      id: row.id,
      deviceId: "dev-1",
      reminderId: "morning",
      status: "taken",
    });
  });
});
