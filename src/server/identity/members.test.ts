import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember } from "../../test/factories";
import { db } from "../shared/db";
import { initials, updateMember } from "./members";
import { members } from "../shared/schema";

it("REQ-003.4: initials of long, single, bracketed, numeric and CJK names", () => {
  expect(initials("Alexandria Catherine Montgomery-Fitzwilliam van der Bergholt")).toBe("AB");
  expect(initials("Sam")).toBe("S");
  expect(initials("(Contractor) Lee")).toBe("(L");
  expect(initials("3M Team")).toBe("3T");
  expect(initials("李 小龙")).toBe("李小");
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