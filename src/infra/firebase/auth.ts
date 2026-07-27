import type { DecodedIdToken } from "firebase-admin/auth";
import { getFirebaseAdmin } from "./admin.js";
import type { AuthenticatedUser } from "./types.js";

/**
 * Verifies a Firebase ID token sent from the client (Caretaker PWA).
 * @param idToken String token passed in Authorization header or body
 * @returns AuthenticatedUser with decoded token details
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<AuthenticatedUser> {
  const { auth } = getFirebaseAdmin();
  const decodedToken: DecodedIdToken = await auth.verifyIdToken(idToken, true);

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    emailVerified: decodedToken.email_verified,
    name: decodedToken.name,
    picture: decodedToken.picture,
    firebaseToken: decodedToken,
  };
}
