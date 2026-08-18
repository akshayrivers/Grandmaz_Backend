import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../../config/index.js";

let transporter: Transporter | null = null;

export function getTransporter(): Transporter | null {
  if (!transporter && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}
