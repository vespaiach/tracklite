import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember } from "../test/factories";
import { db } from "./db";
import { sessions } from "./schema";
import { createToken, hashToken } from "./tokens";

it("SEC-003.1: a stored token hash doesn't work as a session", async () => {
  const token = createToken();
  expect(Buffer.from(token, "base64url")).toHaveLength(32);
  expect(createToken()).not.toBe(token);

  const member = await createMember();
  await db.insert(sessions).values({ memberId: member.id, tokenHash: hashToken(token) });

  const [stored] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)));
  expect(stored.memberId).toBe(member.id);
  expect(stored.tokenHash.includes(Buffer.from(token, "base64url"))).toBe(false);
  expect(stored.tokenHash.toString("latin1")).not.toContain(token);

  const storedAsToken = stored.tokenHash.toString("base64url");
  const found = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(storedAsToken)));
  expect(found).toEqual([]);
});