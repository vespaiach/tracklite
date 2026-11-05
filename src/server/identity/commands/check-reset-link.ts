import "server-only";
import { db } from "../../shared/db";
import { expiredLink, usableLink } from "../password-resets";

export async function checkResetLink(token: string) {
  const [link] = await usableLink(db, token);
  if (!link) throw expiredLink();
}