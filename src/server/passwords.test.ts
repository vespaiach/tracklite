import { expect, it } from "vitest";
import { hashPassword, passwordError, verifyPassword } from "./passwords";

it("REQ-048.1: correct horse battery is accepted", () => {
  expect(passwordError("correct horse battery")).toBeUndefined();
});

it('REQ-048.2: Sh0rt!pass gets "At least 12 characters"', () => {
  expect(passwordError("Sh0rt!pass")).toBe("At least 12 characters");
});

it('REQ-048.3: a 129-character password gets "Too long (max 128)"', () => {
  expect(passwordError("a".repeat(129))).toBe("Too long (max 128)");
  expect(passwordError("a".repeat(128))).toBeUndefined();
});

it("REQ-048: length counts code points, not UTF-16 units", () => {
  expect(passwordError("🔒".repeat(11))).toBe("At least 12 characters");
  expect(passwordError("🔒".repeat(12))).toBeUndefined();
  expect(passwordError("🔒".repeat(128))).toBeUndefined();
  expect(passwordError("🔒".repeat(129))).toBe("Too long (max 128)");
});

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