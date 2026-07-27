import { Resend } from "resend";
import { env } from "../../config/index.js";

let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!resendClient && env.RESEND_API_KEY) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}
