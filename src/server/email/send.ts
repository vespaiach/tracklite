import "server-only";
import { readConfig } from "../config";
import { logEmailFailure } from "../log";
import { type Email, outbox } from "./outbox";

type SendRequest = Email & { idempotencyKey?: string };
type Config = ReturnType<typeof readConfig>;

const timeoutMs = 10_000;

export async function sendEmail(email: SendRequest): Promise<{ providerMessageId: string }> {
  const config = readConfig();
  if (process.env.NODE_ENV === "test") return sendToOutbox(email);
  if (process.env.NODE_ENV === "production") return sendWithResend(email, config);
  return sendWithMailpit(email, config);
}

function sendToOutbox({ to, subject, text }: SendRequest) {
  if (outbox.failing) throw new Error("Email send failed");
  outbox.sent.push({ to, subject, text });
  return { providerMessageId: `outbox-${outbox.sent.length}` };
}

async function sendWithResend(email: SendRequest, config: Config) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    logEmailFailure({ status: response.status, errorName: body.name });
    throw new Error(`Resend answered ${response.status}`);
  }
  return { providerMessageId: body.id as string };
}

async function sendWithMailpit(email: SendRequest, config: Config) {
  const response = await fetch(`http://${config.mailpitHost}:${config.mailpitPort}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: mailpitAddress(config.emailFrom),
      To: [{ Email: email.to }],
      Subject: email.subject,
      Text: email.text,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Mailpit answered ${response.status}`);
  const body = await response.json();
  return { providerMessageId: body.ID as string };
}

function mailpitAddress(address: string) {
  const named = address.match(/^(.*)<(.+)>$/);
  return named ? { Name: named[1].trim(), Email: named[2] } : { Email: address };
}