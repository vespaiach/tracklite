import { seededMembers, seedMembers } from "../src/server/identity";
import { logError } from "../src/server/shared/log";

try {
  await seedMembers();
  console.log("Seeded members (password in src/server/identity/seed.ts):");
  for (const { email, role, deactivated } of seededMembers) {
    console.log(`  ${email}  ${role}${deactivated ? "  deactivated" : ""}`);
  }
  process.exit(0);
} catch (error) {
  logError("boot", "start-failed", error, { script: "seed" });
  process.exit(1);
}