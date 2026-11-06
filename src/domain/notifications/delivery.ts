import type { NotificationChannel } from "../../contract";

export type DeliveryProps = Readonly<{
  id: string;
  channel: NotificationChannel;
  batchId: string;
  recipientId: string;
  targetType: string;
  targetId: string;
  attempts: number;
  lease: string;
}>;

export type Recipient = Readonly<{ deactivatedAt: Date | null }>;

export type Notification = Readonly<{
  id: string;
  batchId: string;
  kind: "assigned" | "mentioned";
  commentId: string | null;
}>;

export type Addressee = Recipient & Readonly<{ email: string }>;

export type NotificationItem = Notification &
  Readonly<{
    actorName: string;
    issueRef: string | null;
    issueTitle: string | null;
    projectName: string;
    projectKey: string;
    linkPath: string;
    excerpt: string;
  }>;

export type DropChecks<R extends Recipient, N extends Notification> = Readonly<{
  recipients: ReadonlyMap<string, R>;
  items: readonly N[];
  existingIssueIds: ReadonlySet<string>;
  assignmentKeys: ReadonlySet<string>;
  existingProjectIds: ReadonlySet<string>;
  mentionKeys: ReadonlySet<string>;
}>;

const retryDelaysMinutes = [1, 4, 10];

export function assignmentKey(memberId: string, issueId: string) {
  return `${memberId}:${issueId}`;
}

export function mentionKey(memberId: string, sourceId: string | null) {
  return `${memberId}:${sourceId}`;
}

export class Delivery {
  readonly #props: DeliveryProps;

  private constructor(props: DeliveryProps) {
    this.#props = props;
  }

  static rehydrate(props: DeliveryProps) {
    return new Delivery(props);
  }

  get props() {
    return this.#props;
  }

  checkedMessage<R extends Recipient, N extends Notification>(checks: DropChecks<R, N>) {
    const recipient = checks.recipients.get(this.#props.recipientId);
    const items = checks.items.filter((item) => item.batchId === this.#props.batchId);

    const kept =
      recipient?.deactivatedAt === null ? items.filter((item) => this.stillWanted(checks, item)) : [];
    const droppedIds = items.filter((item) => !kept.includes(item)).map((item) => item.id);
    return { recipient, kept, droppedIds };
  }

  stillWanted(checks: DropChecks<Recipient, Notification>, item: Notification) {
    const { recipientId, targetType, targetId } = this.#props;
    if (targetType === "project") {
      if (!checks.existingProjectIds.has(targetId)) return true;
    } else {
      if (!checks.existingIssueIds.has(targetId)) return true;
      if (item.kind === "assigned") return checks.assignmentKeys.has(assignmentKey(recipientId, targetId));
    }
    return checks.mentionKeys.has(mentionKey(recipientId, item.commentId ?? targetId));
  }

  afterFailure() {
    const retryInMinutes = retryDelaysMinutes[this.#props.attempts];
    return retryInMinutes === undefined ? ("failed" as const) : { retryInMinutes };
  }
}