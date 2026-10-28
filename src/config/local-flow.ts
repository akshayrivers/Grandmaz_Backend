import type { AuthenticatedUser } from "../infra/firebase/types.js";

/**
 * Laptop-only bypass. Honoured only when LOCAL_FLOW=1 or AUTH_BYPASS=1.
 * server.ts calls assertLocalFlowAllowed() before listen and refuses to
 * start if that flag is combined with NODE_ENV=production.
 * npm start is unchanged and does not set the flag.
 */
export const LOCAL_CARETAKER_TOKEN = "local-caretaker";
export const LOCAL_CARETAKER_UID = "local-caretaker";
export const LOCAL_CARETAKER_EMAIL = "local-caretaker@localhost";
export const LOCAL_DEVICE_ID = "local-device";
export const LOCAL_DEVICE_TOKEN = "dt_localflow_deterministic_device_token";
/** Placeholder key. The local register branch never parses it as a real public key. */
export const LOCAL_PUBLIC_KEY = "local-flow-placeholder";
/** Returned by local register and accepted by local verify. Not a signed challenge. */
export const LOCAL_CHALLENGE = "local-flow-challenge";
export const LOCAL_SIGNATURE = "local-flow";

export function localFlowRequested(): boolean {
  return process.env.LOCAL_FLOW === "1" || process.env.AUTH_BYPASS === "1";
}

export function assertLocalFlowAllowed(): void {
  if (localFlowRequested() && process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to start: LOCAL_FLOW/AUTH_BYPASS is set while NODE_ENV=production"
    );
  }
}

export function localFlowEnabled(): boolean {
  return localFlowRequested() && process.env.NODE_ENV !== "production";
}

export function isLocalCaretakerToken(token: string | null): boolean {
  return localFlowEnabled() && token === LOCAL_CARETAKER_TOKEN;
}

export function localCaretakerUser(): AuthenticatedUser {
  return {
    uid: LOCAL_CARETAKER_UID,
    email: LOCAL_CARETAKER_EMAIL,
    emailVerified: true,
    name: "Local caretaker",
    firebaseToken: { uid: LOCAL_CARETAKER_UID } as AuthenticatedUser["firebaseToken"],
  };
}
