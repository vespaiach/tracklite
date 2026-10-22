import { seededMembers, seedMembers } from "../src/server/shared/seed";

try {
  await seedMembers();
  console.log("Seeded members (password in src/server/shared/seed.ts):");
  for (const { email, role, deactivated } of seededMembers) {
    console.log(`  ${email}  ${role}${deactivated ? "  deactivated" : ""}`);
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}