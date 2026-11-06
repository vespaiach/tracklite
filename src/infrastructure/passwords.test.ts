import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

it('REQ-048.4: " secret phrase 1 " only verifies with its exact spaces', async () => {
  const hash = await hashPassword(" secret phrase 1 ");
  expect(await verifyPassword(hash, " secret phrase 1 ")).toBe(true);
  expect(await verifyPassword(hash, "secret phrase 1")).toBe(false);
});

it("SEC-008.1: the same password hashes differently and neither hash contains it", async () => {
  const password = "correct horse battery";
  const sam = await hashPassword(password);
  const alex = await hashPassword(password);
  expect(sam).not.toBe(alex);
  for (const hash of [sam, alex]) {
    expect(hash).not.toContain(password);
    expect(hash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
  }
});