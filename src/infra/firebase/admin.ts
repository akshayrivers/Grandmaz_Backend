import { initializeApp, getApps, cert } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Auth } from "firebase-admin/auth";
import { env } from "../../config/index.js";

let firebaseApp: App;
let firebaseAuth: Auth;

export function getFirebaseAdmin(): { app: App; auth: Auth } {
  if (getApps().length > 0) {
    const app = getApps()[0]!;
    return { app, auth: getAuth(app) };
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    const formattedPrivateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    firebaseApp = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedPrivateKey,
      }),
    });
  } else {
    firebaseApp = initializeApp();
  }

  firebaseAuth = getAuth(firebaseApp);
  return { app: firebaseApp, auth: firebaseAuth };
}
