import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

it("STD-6: the outbox can be made to fail on demand", async () => {
  outbox.failing = true;

  await expect(sendEmail(email)).rejects.toThrow();
  expect(outbox.sent).toEqual([]);
});

it("§5.2: production sends through Resend's HTTP API", async () => {
  stubProduction();
  const fetch = stubFetch(200, { id: "resend-id-1" });

  const result = await sendEmail({ ...email, idempotencyKey: "42" });

  expect(result).toEqual({ providerMessageId: "resend-id-1" });
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

it("SEC-007: a Resend failure logs only the status and error name", async () => {
  stubProduction();
  stubFetch(429, {
    statusCode: 429,
    name: "daily_quota_exceeded",
    message: "You have reached your daily quota",
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await expect(sendEmail(email)).rejects.toThrow();

  expect(log).toHaveBeenCalledTimes(1);
  const line = JSON.parse(log.mock.calls[0][0] as string);
  expect(line).toMatchObject({
    level: "error",
    event: "email",
    status: 429,
    errorName: "daily_quota_exceeded",
  });
  const written = log.mock.calls[0][0] as string;
  for (const secret of [email.to, email.subject, email.text]) {
    expect(written).not.toContain(secret);
  }
});

it("§5.6: development sends through Mailpit's send API", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("EMAIL_FROM", "Tracklite <notify@mail.example.com>");
  const fetch = stubFetch(200, { ID: "mailpit-id-1" });

  const result = await sendEmail(email);

  expect(result).toEqual({ providerMessageId: "mailpit-id-1" });
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