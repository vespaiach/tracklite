import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db";
import { sessions } from "../tables";
import { hashToken } from "../../shared/tokens";

export async function endSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}