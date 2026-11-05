import { expect, it } from "vitest";
import { afterFailure, assignmentKey, checkedMessage, type DropChecks, mentionKey } from "./model";

const issueId = "issue-42";
const active: { deactivatedAt: Date | null } = { deactivatedAt: null };

function deliveryTo(recipientId: string, batchId = `batch-${recipientId}`) {
  return { batchId, recipientId, targetType: "issue", targetId: issueId, attempts: 0 };
}

function assigned(batchId: string, id = `${batchId}-assigned`) {
  return { id, batchId, kind: "assigned", commentId: null } as const;
}

function mentioned(batchId: string, commentId: string | null, id = `${batchId}-mentioned`) {
  return { id, batchId, kind: "mentioned", commentId } as const;
}

type Item = ReturnType<typeof assigned> | ReturnType<typeof mentioned>;

function checksOf(overrides: Partial<DropChecks<typeof active, Item>>) {
  return {
    recipients: new Map(),
    items: [],
    existingIssueIds: new Set([issueId]),
    assignmentKeys: new Set<string>(),
    existingProjectIds: new Set<string>(),
    mentionKeys: new Set<string>(),
    ...overrides,
  };
}

it("REQ-045.2: reassigned to Jo during the wait → Sam's delivery is dropped; Jo gets one email", () => {
  const sam = deliveryTo("sam");
  const jo = deliveryTo("jo");
  const checks = checksOf({
    recipients: new Map([
      ["sam", active],
      ["jo", active],
    ]),
    items: [assigned(sam.batchId), assigned(jo.batchId)],
    assignmentKeys: new Set([assignmentKey("jo", issueId)]),
  });

  expect(checkedMessage(sam, checks)).toEqual({
    recipient: active,
    kept: [],
    droppedIds: ["batch-sam-assigned"],
  });
  expect(checkedMessage(jo, checks)).toEqual({
    recipient: active,
    kept: [assigned(jo.batchId)],
    droppedIds: [],
  });
});

it("REQ-045.3, REQ-045.4, REQ-045.5: a mention edited out, a comment deleted, or the recipient deactivated during the wait → dropped, no email", () => {
  const editedOut = deliveryTo("edited-out");
  const deletedFor = deliveryTo("deleted-for");
  const deactivated = deliveryTo("deactivated");
  const checks = checksOf({
    recipients: new Map([
      ["edited-out", active],
      ["deleted-for", active],
      ["deactivated", { deactivatedAt: new Date() }],
    ]),
    items: [
      mentioned(editedOut.batchId, "edited-comment"),
      mentioned(deletedFor.batchId, "deleted-comment"),
      assigned(deactivated.batchId),
    ],
    assignmentKeys: new Set([assignmentKey("deactivated", issueId)]),
  });

  for (const delivery of [editedOut, deletedFor, deactivated]) {
    const message = checkedMessage(delivery, checks);
    expect(message.kept).toEqual([]);
    expect(message.droppedIds).toHaveLength(1);
  }
});

it("REQ-045.7: WEB-42 deleted during the wait → Sam still gets the email", () => {
  const sam = deliveryTo("sam");
  const items = [assigned(sam.batchId), mentioned(sam.batchId, null)];
  const checks = checksOf({ recipients: new Map([["sam", active]]), items, existingIssueIds: new Set() });

  expect(checkedMessage(sam, checks)).toEqual({ recipient: active, kept: items, droppedIds: [] });
});

it("REQ-045: one notification dropped, another kept → the email is sent with the kept one only", () => {
  const sam = deliveryTo("sam");
  const mention = mentioned(sam.batchId, "comment-1");
  const checks = checksOf({
    recipients: new Map([["sam", active]]),
    items: [assigned(sam.batchId), mention],
    mentionKeys: new Set([mentionKey("sam", "comment-1")]),
  });

  expect(checkedMessage(sam, checks)).toEqual({
    recipient: active,
    kept: [mention],
    droppedIds: ["batch-sam-assigned"],
  });
});

it("STD-6: a failed send is retried after 1, then 4, then 10 minutes; after the third retry fails it is failed", () => {
  expect([0, 1, 2, 3].map(afterFailure)).toEqual([
    { retryInMinutes: 1 },
    { retryInMinutes: 4 },
    { retryInMinutes: 10 },
    "failed",
  ]);
});