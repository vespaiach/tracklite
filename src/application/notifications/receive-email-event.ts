import type { DeliveryRepository } from "../../domain/notifications/delivery-repository";

type MailEvent = { kind?: "notification" | "invitation" | "untracked"; id?: string };

export type EmailEventServices = {
  signatures: { verify(headers: Headers, body: string): boolean };
  deliveries: DeliveryRepository;
  invitations: { markBounced(providerMessageId: string): Promise<string | undefined> };
  logMail(event: "bounced" | "ignored", fields: MailEvent): void;
};

export async function receiveEmailEvent(services: EmailEventServices, headers: Headers, body: string) {
  if (!services.signatures.verify(headers, body)) return false;

  await handleEvent(services, parseJson(body));

  return true;
}

async function handleEvent(services: EmailEventServices, event: unknown) {
  if (!isRecord(event)) return services.logMail("ignored", {});
  if (event.type !== "email.bounced") return;

  const messageId = bouncedMessageId(event);
  if (!messageId) return services.logMail("ignored", {});

  await markBounced(services, messageId);
}

async function markBounced(
  { deliveries, invitations, logMail }: EmailEventServices,
  providerMessageId: string,
) {
  const deliveryId = await deliveries.markBounced(providerMessageId);
  if (deliveryId) return logMail("bounced", { kind: "notification", id: deliveryId });

  const invitationId = await invitations.markBounced(providerMessageId);
  if (invitationId) return logMail("bounced", { kind: "invitation", id: invitationId });

  logMail("bounced", { kind: "untracked" });
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bouncedMessageId(event: Record<string, unknown>) {
  if (!isRecord(event.data)) return undefined;
  const messageId = event.data.email_id;
  return typeof messageId === "string" && messageId !== "" ? messageId : undefined;
}