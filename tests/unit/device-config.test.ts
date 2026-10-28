import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as dbClient from "../../src/infra/database/client.js";
import * as firebaseAuth from "../../src/infra/firebase/auth.js";
import { buildApp } from "../../src/app.js";
import { DeviceConfigSchema } from "../../src/modules/device-config/device-config.schemas.js";
import { paramsOfCall, passThroughTransactions, queueRows, sqlOfCall } from "./helpers.js";

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
  email: "primary@example.com",
  name: "Primary",
  avatar_url: null,
  phone_e164: null,
  role: "caretaker",
  created_at: new Date(),
  updated_at: new Date(),
};

const deviceTokenRow = {
  token_id: "tok-1",
  id: "dev-uuid-1",
  device_id: "dev-1",
  status: "active",
};

const validConfig = {
  locale: "hi",
  contacts: [
    {
      id: "amma",
      name: "Amma",
      phones: [{ id: "p1", e164: "+919876543210", label: "mobile", whatsapp: true, isDefault: true }],
      order: 0,
      pinned: true,
      photoAssetId: null,
      nameClipId: null,
    },
  ],
  emergency: { primaryCaretakerUserId: null, smsFallback: true },
  home: {
    pinnedContactIds: ["amma"],
    weather: { mode: "city", city: "Jammu", lat: null, lon: null },
    inactivityReturnSec: 60,
  },
  reminders: [],
  voice: { clips: [], ttsRate: 0.9 },
  apps: { visible: [] },
};

function storedRow(version: number, actor: { user?: string | null; device?: string | null } = {}) {
  return {
    device_id: "dev-uuid-1",
    version,
    config: validConfig,
    updated_by_user: actor.user ?? null,
    updated_by_device: actor.device ?? null,
    updated_at: new Date("2026-10-15T00:00:00.000Z"),
  };
}

function signedInAs() {
  vi.mocked(firebaseAuth.verifyFirebaseIdToken).mockResolvedValue({
    uid: "fb-uid-1",
    email: "primary@example.com",
    emailVerified: true,
    firebaseToken: {} as any,
  });
}

describe("device config schema", () => {
  it("accepts the minimal document and rejects a caretaker PIN field", () => {
    expect(DeviceConfigSchema.safeParse(validConfig).success).toBe(true);
    const withPin = DeviceConfigSchema.safeParse({ ...validConfig, pin: "1234" });
    expect(withPin.success).toBe(false);
  });

  it("rejects more than four pinned contacts, a second default phone, and a bad number", () => {
    const contacts = [1, 2, 3, 4, 5].map((n) => ({
      id: `c${n}`,
      name: `Contact ${n}`,
      phones: [{ id: `p${n}`, e164: "+919876543210", label: "", whatsapp: false, isDefault: true }],
      order: n,
      pinned: true,
      photoAssetId: null,
      nameClipId: null,
    }));
    expect(
      DeviceConfigSchema.safeParse({
        ...validConfig,
        contacts,
        home: { ...validConfig.home, pinnedContactIds: contacts.map((c) => c.id) },
      }).success
    ).toBe(false);

    const twoDefaults = structuredClone(validConfig);
    twoDefaults.contacts[0]!.phones.push({
      id: "p2",
      e164: "+919876543211",
      label: "home",
      whatsapp: false,
      isDefault: true,
    });
    expect(DeviceConfigSchema.safeParse(twoDefaults).success).toBe(false);

    const badNumber = structuredClone(validConfig);
    badNumber.contacts[0]!.phones[0]!.e164 = "9876543210";
    expect(DeviceConfigSchema.safeParse(badNumber).success).toBe(false);
  });

  it("requires pinnedContactIds to match contacts marked pinned", () => {
    const mismatched = structuredClone(validConfig);
    mismatched.home.pinnedContactIds = [];
    expect(DeviceConfigSchema.safeParse(mismatched).success).toBe(false);
  });
});

describe("device config HTTP", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    passThroughTransactions();
  });

  it("rejects device config routes without a device token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/device/config" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("DEVICE_TOKEN_INVALID");
  });

  it("rejects a Firebase token on the device config route", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/device/config",
      headers: { authorization: "Bearer eyJhbGciOi..." },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("DEVICE_TOKEN_INVALID");
  });

  it("returns version 0 defaults when the device has no saved config", async () => {
    queueRows([deviceTokenRow], []);
    const res = await app.inject({
      method: "GET",
      url: "/api/device/config",
      headers: { authorization: "Bearer dt_valid" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe('"0"');
    const data = res.json().data;
    expect(data).toMatchObject({
      deviceId: "dev-1",
      version: 0,
      updatedByUserId: null,
      updatedByDeviceId: null,
      updatedAt: null,
    });
    expect(data.config).toMatchObject({
      locale: "hi",
      contacts: [],
      emergency: { primaryCaretakerUserId: null, smsFallback: true },
      home: {
        pinnedContactIds: [],
        weather: { mode: "city", city: null, lat: null, lon: null },
        inactivityReturnSec: 60,
      },
      reminders: [],
      voice: { clips: [], ttsRate: 0.9, model: "gemini-3.8-flash" },
      apps: { visible: [] },
    });
    expect(data.config).not.toHaveProperty("pin");
    expect(data).not.toHaveProperty("device_id");
  });

  it("requires If-Match and refuses to store a PIN", async () => {
    queueRows([deviceTokenRow]);
    const missing = await app.inject({
      method: "PUT",
      url: "/api/device/config",
      headers: { authorization: "Bearer dt_valid" },
      payload: validConfig,
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe("PRECONDITION_REQUIRED");

    queueRows([deviceTokenRow]);
    const pin = await app.inject({
      method: "PUT",
      url: "/api/device/config",
      headers: { authorization: "Bearer dt_valid", "if-match": "0" },
      payload: { ...validConfig, pin: "1234" },
    });
    expect(pin.statusCode).toBe(400);
    expect(pin.json().code).toBe("VALIDATION_ERROR");
    const sqls = vi.mocked(dbClient.query).mock.calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => sql.includes("device_configs"))).toBe(false);
  });

  it("creates version 1 for the device and writes history plus an audit row", async () => {
    queueRows(
      [deviceTokenRow],
      [storedRow(1, { device: "dev-uuid-1" })],
      [],
      []
    );
    const res = await app.inject({
      method: "PUT",
      url: "/api/device/config",
      headers: { authorization: "Bearer dt_valid", "if-match": '"0"' },
      payload: validConfig,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe('"1"');
    expect(res.json().data).toMatchObject({
      deviceId: "dev-1",
      version: 1,
      updatedByUserId: null,
      updatedByDeviceId: "dev-1",
    });
    expect(sqlOfCall(1)).toContain("INSERT INTO device_configs");
    expect(sqlOfCall(1)).toContain("ON CONFLICT (device_id) DO NOTHING");
    expect(paramsOfCall(1)[0]).toBe("dev-uuid-1");
    expect(paramsOfCall(1)[2]).toBeNull();
    expect(paramsOfCall(1)[3]).toBe("dev-uuid-1");
    expect(sqlOfCall(2)).toContain("device_config_history");
    expect(paramsOfCall(2)[1]).toBe(1);
    expect(sqlOfCall(3)).toContain("audit_logs");
    expect(paramsOfCall(3)[2]).toBe("config.updated");
    expect(paramsOfCall(3)[3]).toBe(JSON.stringify({ version: 1 }));
    expect(String(paramsOfCall(3)[3])).not.toContain("+919876543210");
  });

  it("returns 409 when the device's If-Match version is stale and does not write history", async () => {
    queueRows([deviceTokenRow], [], [storedRow(4, { device: "dev-uuid-1" })]);
    const res = await app.inject({
      method: "PUT",
      url: "/api/device/config",
      headers: { authorization: "Bearer dt_valid", "if-match": "2" },
      payload: validConfig,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("CONFIG_VERSION_CONFLICT");
    expect(res.json().details.currentVersion).toBe(4);
    expect(sqlOfCall(1)).toContain("version = version + 1");
    expect(paramsOfCall(1)[1]).toBe(2);
    const sqls = vi.mocked(dbClient.query).mock.calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => sql.includes("device_config_history"))).toBe(false);
  });

  it("returns 409 when creating against a config that already exists", async () => {
    queueRows([deviceTokenRow], [], [storedRow(1, { device: "dev-uuid-1" })]);
    const res = await app.inject({
      method: "PUT",
      url: "/api/device/config",
      headers: { authorization: "Bearer dt_valid", "if-match": "0" },
      payload: validConfig,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().details.currentVersion).toBe(1);
    expect(sqlOfCall(1)).toContain("ON CONFLICT");
  });

  it("returns 401 and 403 for caretaker config routes", async () => {
    const anon = await app.inject({ method: "GET", url: "/api/devices/dev-1/config" });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().code).toBe("UNAUTHENTICATED");

    signedInAs();
    queueRows([userRow], []);
    const unlinked = await app.inject({
      method: "GET",
      url: "/api/devices/dev-1/config",
      headers: { authorization: "Bearer firebase-token" },
    });
    expect(unlinked.statusCode).toBe(403);
    expect(unlinked.json().code).toBe("FORBIDDEN");

    queueRows([userRow], [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "viewer" }]);
    const viewer = await app.inject({
      method: "PUT",
      url: "/api/devices/dev-1/config",
      headers: { authorization: "Bearer firebase-token", "if-match": "0" },
      payload: validConfig,
    });
    expect(viewer.statusCode).toBe(403);
    expect(viewer.json().code).toBe("FORBIDDEN");
  });

  it("lets a linked caretaker replace the config when If-Match matches", async () => {
    signedInAs();
    queueRows(
      [userRow],
      [{ device_uuid: "dev-uuid-1", device_id: "dev-1", role: "primary" }],
      [storedRow(2, { user: "user-1" })],
      [],
      []
    );
    const res = await app.inject({
      method: "PUT",
      url: "/api/devices/dev-1/config",
      headers: { authorization: "Bearer firebase-token", "if-match": "1" },
      payload: validConfig,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe('"2"');
    expect(res.json().data).toMatchObject({
      deviceId: "dev-1",
      version: 2,
      updatedByUserId: "user-1",
      updatedByDeviceId: null,
      config: validConfig,
    });
    expect(sqlOfCall(2)).toContain("version = version + 1");
    expect(paramsOfCall(2)[1]).toBe(1);
    expect(paramsOfCall(2)[3]).toBe("user-1");
    expect(paramsOfCall(2)[4]).toBeNull();
    expect(paramsOfCall(4)[1]).toBe("user-1");
    expect(paramsOfCall(4)[2]).toBe("config.updated");
  });

  it("defaults a missing assistant model and rejects a blank id", () => {
    const withDefault = DeviceConfigSchema.parse({
      ...validConfig,
      voice: { clips: [], ttsRate: 0.9 },
    });
    expect(withDefault.voice.model).toBe("gemini-3.8-flash");
    const prefixed = DeviceConfigSchema.parse({
      ...validConfig,
      voice: { clips: [], ttsRate: 0.9, model: "models/gemini-3.8-flash" },
    });
    expect(prefixed.voice.model).toBe("gemini-3.8-flash");
    const blank = DeviceConfigSchema.safeParse({
      ...validConfig,
      voice: { clips: [], ttsRate: 0.9, model: "!!!" },
    });
    expect(blank.success).toBe(false);
  });
});
