import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { spyOnLoggedErrors } from "../../../test/log";
import { outbox } from "./outbox";
import { sendEmail } from "./send";

const email = { to: "sam@acme.com", subject: "Reset your Tracklite password", text: "Choose a new password" };

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function stubProduction() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("EMAIL_FROM", "Tracklite <notify@mail.example.com>");
}

it("§5.2: production sends through Resend's HTTP API", async () => {
  stubProduction();
  const fetch = stubFetch(200, { id: "resend-id-1" });

  const result = await sendEmail({ ...email, idempotencyKey: "42" });

  expect(result).toEqual({ ok: true, value: { providerMessageId: "resend-id-1" } });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init.method).toBe("POST");
  const headers = new Headers(init.headers);
  expect(headers.get("Authorization")).toBe("Bearer re_test_key");
  expect(headers.get("Idempotency-Key")).toBe("42");
  expect(JSON.parse(init.body as string)).toEqual({
    from: "Tracklite <notify@mail.example.com>",
    to: ["sam@acme.com"],
    subject: email.subject,
    text: email.text,
  });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

it("OPS-007.7, SEC-007: Resend answering 503 logs one bad-status line with host and status, and no URL, key, recipient or text", async () => {
  stubProduction();
  stubFetch(503, { statusCode: 503, name: "internal_server_error", message: `Could not send to ${email.to}` });
  const loggedErrors = spyOnLoggedErrors();

  const result = await sendEmail(email);

  expect(result).toEqual({ ok: false, error: "email-failed" });
  expect(loggedErrors()).toEqual([
    expect.objectContaining({ source: "mail", event: "bad-status", host: "api.resend.com", status: 503 }),
  ]);
  const written = JSON.stringify(loggedErrors());
  for (const secret of ["https://", "re_test_key", email.to, email.subject, email.text]) {
    expect(written).not.toContain(secret);
  }
});

it("OPS-007.8: Resend not answering in time logs one fetch-failed line", async () => {
  stubProduction();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }),
  );
  const loggedErrors = spyOnLoggedErrors();

  const result = await sendEmail(email);

  expect(result).toEqual({ ok: false, error: "email-failed" });
  expect(loggedErrors()).toEqual([
    expect.objectContaining({
      source: "mail",
      event: "fetch-failed",
      host: "api.resend.com",
      error: expect.objectContaining({ name: "TimeoutError" }),
    }),
  ]);
});

it("§4.8: a 200 from Resend without a message id logs one bad-response line naming only the field", async () => {
  stubProduction();
  stubFetch(200, { message: `queued for ${email.to}` });
  const loggedErrors = spyOnLoggedErrors();

  const result = await sendEmail(email);

  expect(result).toEqual({ ok: false, error: "email-failed" });
  expect(loggedErrors()).toEqual([
    expect.objectContaining({ source: "mail", event: "bad-response", host: "api.resend.com", fields: ["id"] }),
  ]);
  expect(JSON.stringify(loggedErrors())).not.toContain(email.to);
});

it("§5.6: development sends through Mailpit's send API", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("EMAIL_FROM", "Tracklite <notify@mail.example.com>");
  const fetch = stubFetch(200, { ID: "mailpit-id-1" });

  const result = await sendEmail(email);

  expect(result).toEqual({ ok: true, value: { providerMessageId: "mailpit-id-1" } });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("http://localhost:8025/api/v1/send");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({
    From: { Name: "Tracklite", Email: "notify@mail.example.com" },
    To: [{ Email: "sam@acme.com" }],
    Subject: email.subject,
    Text: email.text,
  });
});