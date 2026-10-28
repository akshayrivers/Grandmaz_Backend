import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFromAddress, sendViaBrevo } from "../../src/infra/email/brevo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseFromAddress", () => {
  it("splits a display name from the address", () => {
    expect(parseFromAddress("Grandma's Launcher <caretaker@example.com>")).toEqual({
      name: "Grandma's Launcher",
      email: "caretaker@example.com",
    });
  });

  it("accepts a bare address", () => {
    expect(parseFromAddress("caretaker@example.com")).toEqual({ email: "caretaker@example.com" });
  });
});

function verifiedSendersResponse(): Response {
  return new Response(
    JSON.stringify({ senders: [{ email: "caretaker@example.com", name: "self", active: true }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("sendViaBrevo", () => {
  it("posts the invitation over HTTPS with the API key header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(verifiedSendersResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messageId: "<msg-1>" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const messageId = await sendViaBrevo({
      apiKey: "test-key",
      from: "Grandma's Launcher <caretaker@example.com>",
      to: "daughter@example.com",
      subject: "Invitation",
      html: "<p>hello</p>",
      text: "hello",
    });

    expect(messageId).toBe("<msg-1>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("test-key");
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: "Grandma's Launcher", email: "caretaker@example.com" },
      to: [{ email: "daughter@example.com" }],
      subject: "Invitation",
      htmlContent: "<p>hello</p>",
      textContent: "hello",
    });
  });

  it("rejects an SMTP key before calling Brevo", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendViaBrevo({
        apiKey: "xsmtpsib-example",
        from: "caretaker@example.com",
        to: "daughter@example.com",
        subject: "Invitation",
        html: "<p>hello</p>",
        text: "hello",
      }),
    ).rejects.toThrow("xkeysib-");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a sender Brevo has not verified", async () => {
    const fetchMock = vi.fn().mockResolvedValue(verifiedSendersResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendViaBrevo({
        apiKey: "test-key",
        from: "other@example.com",
        to: "daughter@example.com",
        subject: "Invitation",
        html: "<p>hello</p>",
        text: "hello",
      }),
    ).rejects.toThrow("EMAIL_FROM is not a verified Brevo sender");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails when Brevo rejects the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(verifiedSendersResponse())
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "sender not verified" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        ),
    );

    await expect(
      sendViaBrevo({
        apiKey: "test-key",
        from: "caretaker@example.com",
        to: "daughter@example.com",
        subject: "Invitation",
        html: "<p>hello</p>",
        text: "hello",
      }),
    ).rejects.toThrow("Invitation email was not accepted (400): sender not verified");
  });
});
