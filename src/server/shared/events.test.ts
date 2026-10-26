import { expect, it, vi } from "vitest";
import { db } from "./db";
import type { DomainEvent } from "./events";

it("M16: publishing with no subscriber throws, so a missing notifications import can't drop notifications", async () => {
  vi.resetModules();
  const { publish } = await import("./events");
  const event: DomainEvent = { type: "IssueAssigned", actorId: "a", issueId: "i", assigneeIds: ["b"] };

  await expect(db.transaction((tx) => publish(tx, event))).rejects.toThrow("No subscriber for IssueAssigned");
});