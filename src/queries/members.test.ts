import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../infrastructure/db";
import { members } from "../infrastructure/identity/tables";
import { hashPassword } from "../infrastructure/passwords";
import { createMember } from "../test/factories";
import { listMembers, profileResponse } from "./members";

async function listAs(role: "admin" | "member") {
  return listMembers(await createMember({ role }));
}

function rowFor(list: { username: string }[], username: string) {
  return list.find((row) => row.username === username);
}

it("REQ-007.2, REQ-008.2: members get every member, a deactivated one marked and a reactivated one not, without emails or roles", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });
  const jo = await createMember({ fullName: "Jo Park", deactivatedAt: new Date() });
  const reactivated = await createMember({ deactivatedAt: new Date() });
  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, reactivated.id));

  const list = await listAs("member");

  expect(rowFor(list, sam.username)).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
  });
  expect(rowFor(list, jo.username)).toEqual({
    username: jo.username,
    fullName: "Jo Park",
    initials: "JP",
    deactivated: true,
  });
  expect(rowFor(list, reactivated.username)).toMatchObject({ deactivated: false });
});

it("REQ-051: admins get every member with email and role", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });

  const list = await listAs("admin");

  expect(rowFor(list, sam.username)).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: sam.email,
    role: "admin",
  });
});

it("SEC-008.2: a member's profile and the admin's member list contain no password or password hash", async () => {
  const passwordHash = await hashPassword("correct horse battery");
  const sam = await createMember({ passwordHash });

  const sent = JSON.stringify([profileResponse(sam), rowFor(await listAs("admin"), sam.username)]);

  expect(sent).not.toContain(passwordHash);
  expect(sent).not.toContain("$argon2");
  expect(sent.toLowerCase()).not.toContain("password");
});