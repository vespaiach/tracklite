import "server-only";
import { readConfig } from "../../config";
import { type EmailProvider, type OutgoingEmail, sendTimeoutMs } from "../provider";

async function send(email: OutgoingEmail) {
  const { mailpitHost, mailpitPort } = readConfig();
  const response = await fetch(`http://${mailpitHost}:${mailpitPort}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: mailpitAddress(email.from),
      To: [{ Email: email.to }],
      Subject: email.subject,
      Text: email.text,
    }),
    signal: AbortSignal.timeout(sendTimeoutMs),
  });

  if (!response.ok) throw new Error(`Mailpit answered ${response.status}`);
  const body = await response.json();
  return { providerMessageId: body.ID as string };
}

function mailpitAddress(address: string) {
  const named = address.match(/^(.*)<(.+)>$/);
  return named ? { Name: named[1].trim(), Email: named[2] } : { Email: address };
}

export const mailpit: EmailProvider = { send };