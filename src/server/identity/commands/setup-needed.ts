import "server-only";
import { db } from "../../../infrastructure/db";
import { members } from "../../../infrastructure/identity/tables";

export async function setupNeeded() {
  return (await db.$count(members)) === 0;
}