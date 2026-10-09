import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember } from "../test/factories";
import { db } from "./db";
import { initials, updateMember } from "./members";
import { members } from "./schema";

it.each([
  ["Alexandria Catherine Montgomery-Fitzwilliam van der Bergholt", "AB"],
  ["Sam", "S"],
  ["(Contractor) Lee", "(L"],
  ["3M Team", "3T"],
  ["李 小龙", "李小"],
])('REQ-003.4: the initials of "%s" are "%s"', (fullName, expected) => {
  expect(initials(fullName)).toBe(expected);
});

it("STD-2: a member can't change a role or deactivate", async () => {
  const member = await createMember();
  const target = await createMember({ role: "admin" });
  const forbidden = { status: 403, message: "You don't have permission to do that." };

  await expect(updateMember(member, target.username, { role: "member" })).rejects.toMatchObject(forbidden);
  await expect(updateMember(member, target.username, { deactivated: true })).rejects.toMatchObject(forbidden);

  const [stored] = await db.select().from(members).where(eq(members.id, target.id));
  expect(stored.role).toBe("admin");
  expect(stored.deactivatedAt).toBeNull();
});