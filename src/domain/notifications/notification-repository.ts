import type { EventTarget } from "../shared/events";

export type MentionSource = EventTarget | { commentId: string };

export type Notice = Readonly<{
  kind: "assigned" | "mentioned";
  actorId: string;
  target: EventTarget;
  commentId?: string;
  text?: string;
}>;

export interface NotificationRepository {
  replaceMentions(source: MentionSource, text: string): Promise<string[]>;
  record(recipientIds: string[], notice: Notice): Promise<void>;
}