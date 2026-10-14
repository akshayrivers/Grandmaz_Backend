import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as dbClient from "../../src/infra/database/client.js";
import * as firebaseAuth from "../../src/infra/firebase/auth.js";
import { buildApp } from "../../src/app.js";
import { sha256Hex } from "../../src/shared/utils/crypto.js";
import { queueRows, paramsOfCall } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/infra/firebase/auth.js", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

const app = buildApp({ logger: false });

afterAll(async () => {
  await app.close();
});

const userRow = {
  id: "user-1",
  firebase_uid: "fb-uid-1",
  email: "stranger@example.com",
  name: null,
  avatar_url: null,
  phone_e164: null,
  role: "caretaker",
  created_at: new Date(),
  updated_at: new Date(),
};

function signedInAs(uid = "fb-uid-1", email = "stranger@example.com") {
  vi.mocked(firebaseAuth.verifyFirebaseIdToken).mockResolvedValue({
    uid,
    email,
    emailVerified: true,
    firebaseToken: {} as any,
  });
}

describe("device token authentication", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects device routes without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/device/commands" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("DEVICE_TOKEN_INVALID");
  });

  it("rejects a Firebase-style token on device routes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/device/commands",
      headers: { authorization: "Bearer eyJhbGciOi..." },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown/expired/revoked token", async () => {
    queueRows([]);
    const res = await app.inject({
      method: "GET",
      url: "/api/device/commands",
      headers: { authorization: "Bearer dt_unknown" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("DEVICE_TOKEN_INVALID");
  });

  it("accepts a valid token, looks it up by hash and scopes commands to that device", async () => {
    const token = "dt_valid-token-value";
    queueRows(
      [{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }],
      [], // expireStaleTasks
      [
        {
          id: "task-1",
          device_id: "dev-uuid-1",
          device_string_id: "dev-1",
          created_by: "user-1",
          title: "Ring device",
          description: null,
          command: "ring_device",
          payload: {},
          status: "pending",
          result: null,
          scheduled_at: new Date(),
          expires_at: new Date(Date.now() + 60_000),
          delivered_at: new Date(),
          completed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/device/commands?status=pending",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(paramsOfCall(0)).toEqual([sha256Hex(token)]);
    expect(paramsOfCall(2)).toEqual(["dev-uuid-1"]);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data[0]).toMatchObject({ id: "task-1", type: "ring_device", payload: {}, status: "pending" });
  });

  it("returns 404 when a device updates another device's command", async () => {
    queueRows(
      [{ token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" }],
      [{ id: "22222222-2222-4222-8222-222222222222", device_id: "dev-uuid-OTHER", status: "pending" }]
    );
    const res = await app.inject({
      method: "PATCH",
      url: "/api/device/commands/22222222-2222-4222-8222-222222222222/status",
      headers: { authorization: "Bearer dt_valid" },
      payload: { status: "completed", result: { success: true, message: "ok" } },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("COMMAND_NOT_FOUND");
  });
});

describe("caretaker authorization", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 403 for a caretaker who is not linked to the device", async () => {
    signedInAs();
    queueRows([userRow], []); // user sync, getCaretakerAccess → no link
    const res = await app.inject({
      method: "GET",
      url: "/api/shared-state/device/dev-1/latest",
      headers: { authorization: "Bearer firebase-token" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
  });

  it("returns 403 when a viewer tries to send a command", async () => {
    signedInAs();
    queueRows([userRow], [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "viewer" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/commands",
      headers: { authorization: "Bearer firebase-token" },
      payload: { deviceId: "dev-1", command: { type: "ring_device" } },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when a non-primary tries to invite or remove caretakers", async () => {
    signedInAs();
    queueRows([userRow], [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "caretaker" }]);
    const invite = await app.inject({
      method: "POST",
      url: "/api/invitations/device/dev-1",
      headers: { authorization: "Bearer firebase-token" },
      payload: { email: "x@example.com" },
    });
    expect(invite.statusCode).toBe(403);

    queueRows([userRow], [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "caretaker" }]);
    const remove = await app.inject({
      method: "DELETE",
      url: "/api/caretakers/device/dev-1/caretaker/33333333-3333-4333-8333-333333333333",
      headers: { authorization: "Bearer firebase-token" },
    });
    expect(remove.statusCode).toBe(403);
  });

  it("returns 401 without a Firebase token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/devices" });
    expect(res.statusCode).toBe(401);
  });

  it("validates typed commands (E.164) before creating a task", async () => {
    signedInAs();
    queueRows([userRow], [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "primary" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/commands",
      headers: { authorization: "Bearer firebase-token" },
      payload: { deviceId: "dev-1", command: { type: "update_emergency_number", e164: "98765" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});

describe("removed endpoints and error hygiene", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["POST", "/api/invitations"],
    ["POST", "/api/help-requests"],
    ["POST", "/api/shared-state/snapshot"],
    ["POST", "/api/caretakers/link"],
    ["POST", "/api/audit-logs"],
  ])("%s %s is gone", async (method, url) => {
    const res = await app.inject({ method: method as "POST", url, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /api/commands/:id/status is gone", async () => {
    const res = await app.inject({ method: "PATCH", url: "/api/commands/abc/status", payload: { status: "completed" } });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/devices/:deviceId is no longer public", async () => {
    const res = await app.inject({ method: "GET", url: "/api/devices/dev-1" });
    expect(res.statusCode).toBe(401);
  });

  it("does not leak internal error messages on 500", async () => {
    vi.mocked(dbClient.query).mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"));
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/challenge",
      payload: { deviceId: "grandma-device-0001" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe("Internal server error");
    expect(res.body).not.toContain("ECONNREFUSED");
  });
});
