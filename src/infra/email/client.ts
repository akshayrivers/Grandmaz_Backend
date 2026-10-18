import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../../config/index.js";

let transporter: Transporter | null = null;

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
  const { address } = await lookup(servername, { family: 4 });
  transporter = nodemailer.createTransport({
    host: address,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    tls: { servername },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  return transporter;
}
