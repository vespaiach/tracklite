import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { hashPassword } from "./passwords";
import { members } from "./schema";

export const seedPassword = "tracklite-dev-password";

export const seededMembers = [
  { email: "sam@acme.test", fullName: "Sam Rivera", username: "sam", role: "admin", deactivated: false },
  { email: "priya@acme.test", fullName: "Priya Shah", username: "priya", role: "admin", deactivated: false },
  { email: "alex@acme.test", fullName: "Alex Kim", username: "alex", role: "member", deactivated: false },
  {
    email: "jordan@acme.test",
    fullName: "Jordan Lee",
    username: "jordan",
    role: "member",
    deactivated: false,
  },
  {
    email: "maria@acme.test",
    fullName: "Maria Lopez",
    username: "maria",
    role: "member",
    deactivated: false,
  },
  { email: "chen@acme.test", fullName: "Chen Wei", username: "chen", role: "member", deactivated: false },
  {
    email: "taylor@acme.test",
    fullName: "Taylor Brooks",
    username: "taylor",
    role: "member",
    deactivated: true,
  },
] as const;

export async function seedMembers() {
  if (process.env.NODE_ENV === "production") throw new Error("Seeding is for development only");
  const passwordHash = await hashPassword(seedPassword);
  await db
    .insert(members)
    .values(
      seededMembers.map(({ deactivated, ...member }) => ({
        ...member,
        passwordHash,
        deactivatedAt: deactivated ? sql`now()` : null,
      })),
    )
    .onConflictDoNothing();
}