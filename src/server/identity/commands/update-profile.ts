import "server-only";
import { eq } from "drizzle-orm";
import type { ProfileChanges } from "../schemas";
import { db } from "../../../infrastructure/db";
import { members } from "../../../infrastructure/identity/tables";
import type { Member } from "../sessions";

export async function updateProfile(actor: Member, { fullName }: ProfileChanges) {
  const [updated] = await db.update(members).set({ fullName }).where(eq(members.id, actor.id)).returning();
  return updated;
}