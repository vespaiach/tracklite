import "server-only";
import { db } from "../../shared/db";
import { members } from "../tables";

export async function setupNeeded() {
  return (await db.$count(members)) === 0;
}