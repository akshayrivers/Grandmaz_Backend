import type { DecodedIdToken } from "firebase-admin/auth";

export interface AuthenticatedUser {
  uid: string;
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  name?: string | undefined;
  picture?: string | undefined;
  firebaseToken: DecodedIdToken;
}
