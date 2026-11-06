import type { DomainEvent, EventTarget } from "../shared/events";

export type MentionSource = EventTarget | { commentId: string };

export type Notice = Readonly<{
  kind: "assigned" | "mentioned";
  actorId: string;
  target: EventTarget;
  commentId?: string;
  text?: string;
}>;

export type Snapshot = Readonly<{
  targetType: "issue" | "project";
  targetId: string;
  issueRef: string | null;
  issueTitle: string | null;
  projectName: string;
  projectKey: string;
  linkPath: string;
  excerpt: string;
}>;

export type OutboxPayload = Readonly<{
  kind: Notice["kind"];
  actorId: string;
  commentId: string | null;
  recipientIds: string[];
  snapshot: Snapshot;
}>;

export type OutboxEvent = Readonly<{ id: string; type: DomainEvent["type"]; payload: OutboxPayload }>;

export interface OutboxWriter {
  replaceMentions(source: MentionSource, text: string): Promise<string[]>;
  add(type: DomainEvent["type"], recipientIds: string[], notice: Notice): Promise<void>;
}

export interface NotificationRepository {
  record(event: OutboxEvent, recipientId: string): Promise<void>;
}

const eventRetryDelaysMinutes = [1, 4, 10];
const eventRetryCeilingMinutes = 60;

export function eventRetryInMinutes(attempts: number) {
  return eventRetryDelaysMinutes[attempts] ?? eventRetryCeilingMinutes;
}