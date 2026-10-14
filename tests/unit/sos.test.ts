import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as firebaseAuth from "../../src/infra/firebase/auth.js";
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

const tokenRow = { token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" };

describe("SOS alerts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires a device token to start an alert", async () => {
    const res = await app.inject({ method: "POST", url: "/api/device/sos", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("starts an alert for the device token", async () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      device_id: "dev-uuid-1",
      device_string_id: "dev-1",
      status: "active",
      latitude: 32.7,
      longitude: 74.8,
      accuracy_m: 20,
      created_at: new Date(),
      updated_at: new Date(),
      acknowledged_by: null,
      acknowledged_at: null,
    };
    queueRows(
      [{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }],
      [row],
      [],
      [row],
      [],
      [row]
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/device/sos",
      headers: { authorization: "Bearer dt_valid" },
      payload: { latitude: 32.7, longitude: 74.8, accuracyM: 20 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ id: row.id, deviceId: "dev-1", status: "active" });
  });

  it("does not let a viewer acknowledge", async () => {
    vi.mocked(firebaseAuth.verifyFirebaseIdToken).mockResolvedValue({
      uid: "fb-1",
      email: "v@example.com",
      emailVerified: true,
      firebaseToken: {} as any,
    });
    queueRows(
      [{
        id: "11111111-1111-4111-8111-111111111111",
        device_id: "dev-uuid-1",
        device_string_id: "dev-1",
        status: "active",
        latitude: null,
        longitude: null,
        accuracy_m: null,
        created_at: new Date(),
        updated_at: new Date(),
        acknowledged_by: null,
        acknowledged_at: null,
      }],
      [{
        id: "user-1",
        firebase_uid: "fb-1",
        email: "v@example.com",
        name: null,
        avatar_url: null,
        phone_e164: null,
        role: "caretaker",
        created_at: new Date(),
        updated_at: new Date(),
      }],
      [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "viewer" }]
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/sos/11111111-1111-4111-8111-111111111111/ack",
      headers: { authorization: "Bearer firebase" },
    });
    expect(res.statusCode).toBe(403);
  });
});
