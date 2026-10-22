import { expect, it, vi } from "vitest";
import { db } from "./db";

it("M16: publishing with no subscriber throws, so a missing notifications import can't drop notifications", async () => {
  vi.resetModules();
  const { publish } = await import("./events");
  const event = { type: "IssueAssigned", actorId: "a", issueId: "i", assigneeId: "b" } as const;

  await expect(db.transaction((tx) => publish(tx, event))).rejects.toThrow("No subscriber for IssueAssigned");
});