import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as dbClient from "../../src/infra/database/client.js";
import * as firebaseAuth from "../../src/infra/firebase/auth.js";
import { buildApp } from "../../src/app.js";
import { storage } from "../../src/infra/storage/index.js";
import { passThroughTransactions, queueRows, sqlOfCall } from "./helpers.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/infra/firebase/auth.js", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

vi.mock("../../src/infra/storage/index.js", () => ({
  storage: {
    put: vi.fn(async () => undefined),
    open: vi.fn(async () => Buffer.from("photo-bytes")),
  },
}));

const app = buildApp({ logger: false });

afterAll(async () => {
  await app.close();
});

const deviceTokenRow = { token_id: "tok-1", id: "dev-uuid-1", device_id: "dev-1", status: "active" };
const userRow = {
  id: "user-1",
  firebase_uid: "fb-uid-1",
  email: "primary@example.com",
  name: null,
  avatar_url: null,
  phone_e164: null,
  role: "caretaker",
  created_at: new Date(),
  updated_at: new Date(),
};

const tinyJpeg = Buffer.from("hello").toString("base64");

function assetRow() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    device_id: "dev-uuid-1",
    kind: "photo",
    content_type: "image/jpeg",
    byte_size: 5,
    duration_ms: null,
    storage_key: "dev-uuid-1/11111111-1111-4111-8111-111111111111",
    created_by_user: null,
    created_by_device: "dev-uuid-1",
    created_at: new Date(),
  };
}

describe("media upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    passThroughTransactions();
    vi.mocked(storage.put).mockResolvedValue(undefined);
    vi.mocked(storage.open).mockResolvedValue(Buffer.from("photo-bytes"));
  });

  it("rejects an upload without a device token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/device/media",
      payload: { kind: "photo", contentType: "image/jpeg", dataBase64: tinyJpeg },
    });
    expect(res.statusCode).toBe(401);
  });

  it("stores a photo and returns an asset id", async () => {
    queueRows([deviceTokenRow], [assetRow()], []);
    const res = await app.inject({
      method: "POST",
      url: "/api/device/media",
      headers: { authorization: "Bearer dt_valid" },
      payload: { kind: "photo", contentType: "image/jpeg", dataBase64: tinyJpeg },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ assetId: assetRow().id, kind: "photo", byteSize: 5 });
    expect(storage.put).toHaveBeenCalledOnce();
    expect(sqlOfCall(1)).toContain("INSERT INTO media_assets");
    expect(sqlOfCall(2)).toContain("audit_logs");
  });

  it("rejects audio longer than 30 seconds before writing", async () => {
    queueRows([deviceTokenRow]);
    const res = await app.inject({
      method: "POST",
      url: "/api/device/media",
      headers: { authorization: "Bearer dt_valid" },
      payload: { kind: "audio", contentType: "audio/mpeg", dataBase64: tinyJpeg },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("AUDIO_TOO_LONG");
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("returns the bytes for an asset that belongs to the device", async () => {
    queueRows([deviceTokenRow], [assetRow()]);
    const res = await app.inject({
      method: "GET",
      url: `/api/device/media/${assetRow().id}`,
      headers: { authorization: "Bearer dt_valid" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.body).toBe("photo-bytes");
  });

  it("does not let a viewer upload", async () => {
    vi.mocked(firebaseAuth.verifyFirebaseIdToken).mockResolvedValue({
      uid: "fb-uid-1",
      email: "primary@example.com",
      emailVerified: true,
      firebaseToken: {} as any,
    });
    queueRows([userRow], [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "viewer" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/dev-1/media",
      headers: { authorization: "Bearer firebase-token" },
      payload: { kind: "photo", contentType: "image/jpeg", dataBase64: tinyJpeg },
    });
    expect(res.statusCode).toBe(403);
  });
});
