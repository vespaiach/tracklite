import { createHmac, randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { resend } from "./resend";

const secretBytes = randomBytes(24);
const settings = { webhookSecret: `whsec_${secretBytes.toString("base64")}` };

function report(type: string, key = secretBytes) {
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type, data: { email_id: "resend-id-1" } });
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  });
  return { headers, body };
}

it("§5.4: Resend's bounce report gives the bounced message ID when signed", () => {
  const { headers, body } = report("email.bounced");

  expect(resend.readBounceReport(headers, body, settings)).toEqual({ bouncedMessageId: "resend-id-1" });
});

it("§5.4: Resend's bounce report is unsigned with a wrong signature or no secret", () => {
  const forged = report("email.bounced", randomBytes(24));
  const signed = report("email.bounced");

  expect(resend.readBounceReport(forged.headers, forged.body, settings)).toBe("unsigned");
  expect(resend.readBounceReport(signed.headers, signed.body, { webhookSecret: undefined })).toBe("unsigned");
});

it("§5.4: Resend's bounce report gives no message ID for other event types", () => {
  const { headers, body } = report("email.delivered");

  expect(resend.readBounceReport(headers, body, settings)).toEqual({ bouncedMessageId: null });
});