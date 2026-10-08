import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { outbox } from "../../../server/email/outbox";
import { invitations, notificationEmails } from "../../../server/schema";
import { createMember } from "../../../test/factories";
import { invitedBy, listedInvitation, signedInAdmin, uniqueEmail } from "../../../test/invitations";
import { POST } from "./route";

const secretBytes = randomBytes(24);
const secret = `whsec_${secretBytes.toString("base64")}`;

let logLines: Record<string, unknown>[];

beforeEach(() => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  logLines = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logLines.push(JSON.parse(line));
  });
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function uniqueMessageId() {
  return `msg-${randomUUID()}`;
}

function event(type: string, messageId: string) {
  return JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: messageId, to: ["sam@acme.com"] },
  });
}

function sign(id: string, timestamp: string, body: string, key = secretBytes) {
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function nowSeconds(offsetSeconds = 0) {
  return String(Math.floor(Date.now() / 1000) + offsetSeconds);
}

function webhook(body: string, headers: Record<string, string>) {
  return POST(
    new Request("http://localhost:3000/webhooks/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    }),
  );
}

function signedWebhook(body: string, { timestamp = nowSeconds(), signature = "" } = {}) {
  const id = `msg_${randomUUID()}`;
  return webhook(body, {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature || sign(id, timestamp, body),
  });
}

async function sentNotificationEmail() {
  const sam = await createMember();
  const providerMessageId = uniqueMessageId();
  const [email] = await db
    .insert(notificationEmails)
    .values({
      recipientId: sam.id,
      targetType: "issue",
      targetId: randomUUID(),
      sendAfter: new Date(),
      state: "sent",
      attempts: 1,
      providerMessageId,
    })
    .returning();
  return { id: email.id, providerMessageId };
}

async function stateOf(emailId: string) {
  const [email] = await db
    .select({ state: notificationEmails.state })
    .from(notificationEmails)
    .where(eq(notificationEmails.id, emailId));
  return email.state;
}

it("API-003.1: a bounce for a notification email marks it Bounced, logs it and answers 200", async () => {
  const email = await sentNotificationEmail();

  const response = await signedWebhook(event("email.bounced", email.providerMessageId));

  expect(response.status).toBe(200);
  expect(await stateOf(email.id)).toBe("bounced");
  expect(logLines).toContainEqual(
    expect.objectContaining({ event: "email", message: `email bounced, notification ${email.id}` }),
  );
});

it("API-003.2: a bounce for an invitation email shows it as Bounced in the list API", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { invitation } = await invitedBy(cookie, email);
  const providerMessageId = uniqueMessageId();
  await db.update(invitations).set({ providerMessageId }).where(eq(invitations.id, invitation.id));

  const response = await signedWebhook(event("email.bounced", providerMessageId));

  expect(response.status).toBe(200);
  expect(await listedInvitation(cookie, email)).toEqual(expect.objectContaining({ state: "bounced" }));
  expect(logLines).toContainEqual(
    expect.objectContaining({ event: "email", message: `email bounced, invitation ${invitation.id}` }),
  );
});

it("API-003.3: a report with a missing or wrong signature → 401; nothing changes", async () => {
  const email = await sentNotificationEmail();
  const body = event("email.bounced", email.providerMessageId);
  const timestamp = nowSeconds();
  const id = `msg_${randomUUID()}`;

  const unsigned = await webhook(body, {});
  const wrongSecret = await webhook(body, {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": sign(id, timestamp, body, randomBytes(24)),
  });
  const tamperedBody = await webhook(body.replace("email.bounced", "email.bounced "), {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": sign(id, timestamp, body),
  });

  expect([unsigned.status, wrongSecret.status, tamperedBody.status]).toEqual([401, 401, 401]);
  expect(await stateOf(email.id)).toBe("sent");
});

it("API-003.4: a correctly signed report more than 5 minutes old (or ahead) → 401; nothing changes", async () => {
  const email = await sentNotificationEmail();
  const body = event("email.bounced", email.providerMessageId);

  const stale = await signedWebhook(body, { timestamp: nowSeconds(-6 * 60) });
  const ahead = await signedWebhook(body, { timestamp: nowSeconds(6 * 60) });

  expect([stale.status, ahead.status]).toEqual([401, 401]);
  expect(await stateOf(email.id)).toBe("sent");
});

it('API-003.5: a signed report of another kind, such as "delivered" → 200; nothing changes', async () => {
  const email = await sentNotificationEmail();

  const response = await signedWebhook(event("email.delivered", email.providerMessageId));

  expect(response.status).toBe(200);
  expect(await stateOf(email.id)).toBe("sent");
});

it("API-003.6: a signed bounce for an untracked email → 200; logged as untracked", async () => {
  const response = await signedWebhook(event("email.bounced", uniqueMessageId()));

  expect(response.status).toBe(200);
  expect(logLines).toContainEqual(
    expect.objectContaining({ event: "email", message: "email bounced, untracked" }),
  );
});

it("§5.4: a signature matching any v1 entry in the header is accepted", async () => {
  const email = await sentNotificationEmail();
  const body = event("email.bounced", email.providerMessageId);
  const id = `msg_${randomUUID()}`;
  const timestamp = nowSeconds();
  const wrong = sign(id, timestamp, body, randomBytes(24));

  const response = await webhook(body, {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `${wrong} ${sign(id, timestamp, body)}`,
  });

  expect(response.status).toBe(200);
  expect(await stateOf(email.id)).toBe("bounced");
});