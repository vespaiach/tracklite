import * as v from "valibot";
import { expect, it } from "vitest";
import { newPassword } from "./password";

function passwordError(password: string) {
  const result = v.safeParse(newPassword, password, { abortPipeEarly: true });
  return result.success ? undefined : result.issues[0].message;
}

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