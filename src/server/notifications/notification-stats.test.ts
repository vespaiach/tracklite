import { expect, it } from "vitest";
import { createMember } from "../../test/factories";
import { notificationStats } from "./commands/notification-stats";

it("REQ-053.8, STD-2: a member can't read notification stats", async () => {
  const member = await createMember();

  await expect(notificationStats(member)).rejects.toMatchObject({
    kind: "forbidden",
    message: "You don't have permission to do that.",
  });
});