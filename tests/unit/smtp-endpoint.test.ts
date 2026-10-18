import { describe, expect, it } from "vitest";
import { smtpEndpoint } from "../../src/infra/email/client.js";

describe("smtpEndpoint", () => {
  it("moves Brevo off the ports Render's free instance blocks", () => {
    expect(smtpEndpoint("smtp-relay.brevo.com", 587)).toEqual({ port: 2525, secure: false });
    expect(smtpEndpoint("smtp-relay.brevo.com", 465)).toEqual({ port: 2525, secure: false });
  });

  it("leaves another host on the configured port", () => {
    expect(smtpEndpoint("smtp.gmail.com", 465)).toEqual({ port: 465, secure: true });
  });
});
