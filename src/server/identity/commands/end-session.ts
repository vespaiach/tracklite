import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import { sessions } from "../../../infrastructure/identity/tables";
import { hashToken } from "../../../infrastructure/tokens";

export async function endSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}