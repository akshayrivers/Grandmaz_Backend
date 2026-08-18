import { describe, it, expect, vi, beforeEach } from "vitest";
import { authService } from "../../src/modules/auth/auth.service.js";
import * as dbClient from "../../src/infra/database/client.js";
import * as firebaseAuth from "../../src/infra/firebase/auth.js";

vi.mock("../../src/infra/database/client.js", () => ({
  query: vi.fn(),
}));

vi.mock("../../src/infra/firebase/auth.js", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyAndSyncUser", () => {
    it("should throw an error if firebase user has no email", async () => {
      const mockFirebaseUser = {
        uid: "firebase-uid-123",
        firebaseToken: {} as any,
      };

      await expect(authService.verifyAndSyncUser(mockFirebaseUser)).rejects.toThrow(
        "Firebase user must have an email address"
      );
    });

    it("should update existing user when found in DB", async () => {
      const mockFirebaseUser = {
        uid: "firebase-uid-123",
        email: "caretaker@example.com",
        name: "Test Caretaker",
        picture: "https://example.com/avatar.png",
        firebaseToken: {} as any,
      };

      // Mock DB select returning existing user
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "user-uuid-1",
            firebase_uid: "firebase-uid-123",
            email: "caretaker@example.com",
            name: "Old Name",
            avatar_url: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      // Mock DB update query
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "user-uuid-1",
            firebase_uid: "firebase-uid-123",
            email: "caretaker@example.com",
            name: "Test Caretaker",
            avatar_url: "https://example.com/avatar.png",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
        command: "UPDATE",
        oid: 0,
        fields: [],
      });

      // Mock auto-link of pending invitations (no pending rows)
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const user = await authService.verifyAndSyncUser(mockFirebaseUser);

      expect(user.id).toBe("user-uuid-1");
      expect(user.name).toBe("Test Caretaker");
      expect(dbClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe("acceptInvitation", () => {
    it("should validate invitation and link caretaker to device", async () => {
      const idToken = "mock-id-token";
      const invitationToken = "invitation-token-xyz";

      vi.mocked(firebaseAuth.verifyFirebaseIdToken).mockResolvedValueOnce({
        uid: "firebase-uid-123",
        email: "invited@example.com",
        name: "Invited Caretaker",
        firebaseToken: {} as any,
      });

      // 1. Mock select invitation query
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "invitation-id-1",
            device_id: "device-uuid-999",
            email: "invited@example.com",
            token: invitationToken,
            expires_at: new Date(Date.now() + 86400000), // future
            accepted_at: null,
          },
        ],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      // 2. Mock user select query (no existing user)
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      // 3. Mock user insert query
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "user-uuid-new",
            firebase_uid: "firebase-uid-123",
            email: "invited@example.com",
            name: "Invited Caretaker",
            avatar_url: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      // 4. Mock auto-link of pending invitations (no pending rows)
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      // 5. Mock device_caretakers insert query
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      // 6. Mock invitation update query
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: "UPDATE",
        oid: 0,
        fields: [],
      });

      // 7. Mock device details fetch query
      vi.mocked(dbClient.query).mockResolvedValueOnce({
        rows: [
          {
            id: "device-uuid-999",
            device_id: "device-uuid-999",
            device_metadata: null,
            is_verified: false,
            status: "active",
          },
        ],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const result = await authService.acceptInvitation(idToken, invitationToken);

      expect(result.deviceId).toBe("device-uuid-999");
      expect(result.user.email).toBe("invited@example.com");
      expect(result.message).toContain("accepted successfully");
    });
  });
});
