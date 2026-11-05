export type Delivery = Readonly<{
  batchId: string;
  recipientId: string;
  targetType: string;
  targetId: string;
  attempts: number;
}>;

type Recipient = Readonly<{ deactivatedAt: Date | null }>;

type Notification = Readonly<{
  id: string;
  batchId: string;
  kind: "assigned" | "mentioned";
  commentId: string | null;
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

export function checkedMessage<R extends Recipient, N extends Notification>(
  delivery: Delivery,
  checks: DropChecks<R, N>,
) {
  const recipient = checks.recipients.get(delivery.recipientId);
  const items = checks.items.filter((item) => item.batchId === delivery.batchId);

  const kept =
    recipient?.deactivatedAt === null ? items.filter((item) => stillWanted(checks, delivery, item)) : [];
  const droppedIds = items.filter((item) => !kept.includes(item)).map((item) => item.id);
  return { recipient, kept, droppedIds };
}

function stillWanted(checks: DropChecks<Recipient, Notification>, delivery: Delivery, item: Notification) {
  if (delivery.targetType === "project") {
    if (!checks.existingProjectIds.has(delivery.targetId)) return true;
  } else {
    if (!checks.existingIssueIds.has(delivery.targetId)) return true;
    if (item.kind === "assigned")
      return checks.assignmentKeys.has(assignmentKey(delivery.recipientId, delivery.targetId));
  }
  return checks.mentionKeys.has(mentionKey(delivery.recipientId, item.commentId ?? delivery.targetId));
}

export function afterFailure(attempts: number) {
  const retryInMinutes = retryDelaysMinutes[attempts];
  return retryInMinutes === undefined ? ("failed" as const) : { retryInMinutes };
}