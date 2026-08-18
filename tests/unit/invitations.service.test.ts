import { describe, it, expect, vi, beforeEach } from "vitest";
import { invitationsService } from "../../src/modules/invitations/invitations.service.js";
import * as dbClient from "../../src/infra/database/client.js";
import * as emailInfra from "../../src/infra/email/index.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
}));

vi.mock("../../src/infra/email/index.js", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({
    success: true,
    inviteUrl: "http://localhost:5173/accept-invitation?token=mocked-token-hex",
  }),
}));

describe("InvitationsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createInvitation", () => {
    it("should insert invitation record and return invite URL", async () => {
      const mockDeviceId = "dev-123";
      const mockEmail = "caretaker@test.com";

      // Mock device UUID resolution
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [{ id: "device-uuid-1" }],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "inv-uuid-1",
            device_id: mockDeviceId,
            email: mockEmail,
            token: "mocked-token-hex",
            expires_at: new Date(),
            accepted_at: null,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      const result = await invitationsService.createInvitation({
        deviceId: mockDeviceId,
        email: mockEmail,
      });

      expect(result.invitation.id).toBe("inv-uuid-1");
      expect(result.inviteUrl).toContain("/accept-invitation?token=");
      expect(dbClient.query).toHaveBeenCalledTimes(2);
      expect(emailInfra.sendInvitationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("getInvitationDetails", () => {
    it("should return valid invitation details", async () => {
      const mockToken = "valid-token-123";

      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "inv-uuid-1",
            device_id: "dev-123",
            email: "caretaker@test.com",
            token: mockToken,
            expires_at: new Date(Date.now() + 86400000), // future
            accepted_at: null,
          },
        ],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const details = await invitationsService.getInvitationDetails(mockToken);

      expect(details.valid).toBe(true);
      expect(details.email).toBe("caretaker@test.com");
      expect(details.deviceId).toBe("dev-123");
    });

    it("should throw error if invitation is expired", async () => {
      const mockToken = "expired-token";

      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "inv-uuid-1",
            device_id: "dev-123",
            email: "caretaker@test.com",
            token: mockToken,
            expires_at: new Date(Date.now() - 1000), // expired
            accepted_at: null,
          },
        ],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      await expect(invitationsService.getInvitationDetails(mockToken)).rejects.toThrow(
        "Invitation has expired"
      );
    });
  });
});
