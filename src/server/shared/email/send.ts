import "server-only";
import { readConfig } from "../config";
import { logError } from "../log";
import { err, ok, type Result } from "../result";
import { type Email, outbox } from "./outbox";

type SendRequest = Email & { idempotencyKey?: string };
type Config = ReturnType<typeof readConfig>;
type Sent = Result<{ providerMessageId: string }, "email-failed">;

const timeoutMs = 10_000;

export async function sendEmail(email: SendRequest): Promise<Sent> {
  const config = readConfig();
  if (process.env.NODE_ENV === "test") return sendToOutbox(email);
  if (process.env.NODE_ENV === "production") return sendWithResend(email, config);
  return sendWithMailpit(email, config);
}

function sendToOutbox({ to, subject, text }: SendRequest): Sent {
  if (outbox.failing) return err("email-failed");
  outbox.sent.push({ to, subject, text });
  return ok({ providerMessageId: `outbox-${outbox.sent.length}` });
}

function sendWithResend(email: SendRequest, config: Config) {
  return post("https://api.resend.com/emails", "id", {
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: { from: config.emailFrom, to: [email.to], subject: email.subject, text: email.text },
  });
}

function sendWithMailpit(email: SendRequest, config: Config) {
  return post(`http://${config.mailpitHost}:${config.mailpitPort}/api/v1/send`, "ID", {
    headers: {},
    body: {
      From: mailpitAddress(config.emailFrom),
      To: [{ Email: email.to }],
      Subject: email.subject,
      Text: email.text,
    },
  });
}

async function post(
  url: string,
  idField: string,
  request: { headers: Record<string, string>; body: object },
): Promise<Sent> {
  const host = new URL(url).host;

  const response = await fetch(url, {
    method: "POST",
    headers: { ...request.headers, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: unknown) => {
    logError("mail", "fetch-failed", error, { host });
    return null;
  });
  if (!response) return err("email-failed");

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    logError("mail", "bad-status", providerError(body, response.status), { host, status: response.status });
    return err("email-failed");
  }

  const providerMessageId = body?.[idField];
  if (typeof providerMessageId !== "string") {
    logError("mail", "bad-response", new Error("Unexpected response"), { host, fields: [idField] });
    return err("email-failed");
  }
  return ok({ providerMessageId });
}

function providerError(body: { name?: unknown } | null, status: number) {
  const error = new Error(`Answered ${status}`);
  if (typeof body?.name === "string") error.name = body.name;
  return error;
}

function mailpitAddress(address: string) {
  const named = address.match(/^(.*)<(.+)>$/);
  return named ? { Name: named[1].trim(), Email: named[2] } : { Email: address };
}