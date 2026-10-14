import { describe, it, expect } from "vitest";
import { CommandSchema, createTaskSchema } from "../../src/modules/commands/commands.schemas.js";

describe("CommandSchema", () => {
  it.each([
    { type: "ring_device" },
    { type: "sync_now" },
    { type: "report_location" },
    { type: "show_message", text: "Dinner is at 8" },
    { type: "show_message", text: "Hello", voiceClipId: "clip-1" },
    { type: "set_volume", level: 0 },
    { type: "set_volume", level: 100 },
    { type: "update_emergency_number", e164: "+919876543210" },
  ])("accepts %o", (command) => {
    expect(CommandSchema.safeParse(command).success).toBe(true);
  });

  it.each([
    { type: "reboot" },
    { type: "ring_device", extra: true },
    { type: "show_message", text: "" },
    { type: "show_message", text: "x".repeat(501) },
    { type: "set_volume", level: 101 },
    { type: "set_volume", level: 5.5 },
    { type: "update_emergency_number", e164: "9876543210" },
    { type: "update_emergency_number", e164: "+0123456789" },
  ])("rejects %o", (command) => {
    expect(CommandSchema.safeParse(command).success).toBe(false);
  });

  it("defaults expiresInMinutes to 60 and caps it at a day", () => {
    const parsed = createTaskSchema.parse({ deviceId: "dev-1", command: { type: "sync_now" } });
    expect(parsed.expiresInMinutes).toBe(60);
    expect(
      createTaskSchema.safeParse({ deviceId: "dev-1", command: { type: "sync_now" }, expiresInMinutes: 2000 }).success
    ).toBe(false);
  });
});
