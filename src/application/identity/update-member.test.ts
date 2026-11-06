import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { Role } from "../../domain/identity/role";
import { Username } from "../../domain/shared/identifiers";
import { db } from "../../infrastructure/db";
import { identityWork } from "../../infrastructure/identity/repositories";
import { members } from "../../infrastructure/identity/tables";
import { createMember } from "../../test/factories";
import { updateMember } from "./update-member";

it("STD-2: a member can't change a role or deactivate", async () => {
  const member = await createMember();
  const target = await createMember({ role: "admin" });
  const forbidden = { kind: "forbidden", message: "You don't have permission to do that." };

  await expect(
    updateMember(member, identityWork, Username.from(target.username), { role: Role.member }),
  ).rejects.toMatchObject(forbidden);
  await expect(
    updateMember(member, identityWork, Username.from(target.username), { deactivated: true }),
  ).rejects.toMatchObject(forbidden);

  const [stored] = await db.select().from(members).where(eq(members.id, target.id));
  expect(stored.role).toBe("admin");
  expect(stored.deactivatedAt).toBeNull();
});