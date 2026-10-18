import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../../config/index.js";

let transporter: Transporter | null = null;

/**
 * Render's free instance blocks ports 25, 465, and 587. Brevo accepts the same
 * SMTP login and SMTP key on 2525, which that block does not cover.
 */
export function smtpEndpoint(host: string, port: number): { port: number; secure: boolean } {
  if (host === "smtp-relay.brevo.com" && (port === 25 || port === 465 || port === 587)) {
    return { port: 2525, secure: false };
  }
  return { port, secure: port === 465 };
}

export async function getTransporter(): Promise<Transporter | null> {
  if (transporter) {
    return transporter;
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  // This nodemailer version picks a random A or AAAA address. Render cannot
  // route IPv6, so connect to the IPv4 address and keep the hostname for TLS.
  const servername = env.SMTP_HOST;
  const endpoint = smtpEndpoint(servername, env.SMTP_PORT);
  const { address } = await lookup(servername, { family: 4 });
  transporter = nodemailer.createTransport({
    host: address,
    port: endpoint.port,
    secure: endpoint.secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    tls: { servername },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transporter;
}
