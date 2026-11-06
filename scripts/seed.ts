import { seededMembers, seedMembers } from "../src/infrastructure/identity/seed";
import { logError } from "../src/infrastructure/log";

try {
  await seedMembers();
  console.log("Seeded members (password in src/infrastructure/identity/seed.ts):");
  for (const { email, role, deactivated } of seededMembers) {
    console.log(`  ${email}  ${role}${deactivated ? "  deactivated" : ""}`);
  }
  process.exit(0);
} catch (error) {
  logError("boot", "start-failed", error, { script: "seed" });
  process.exit(1);
}