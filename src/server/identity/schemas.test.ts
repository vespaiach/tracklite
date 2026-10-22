import * as v from "valibot";
import { expect, it } from "vitest";
import { newPassword, parseUsername } from "./schemas";

function passwordError(password: string) {
  const result = v.safeParse(newPassword, password, { abortPipeEarly: true });
  return result.success ? undefined : result.issues[0].message;
}

it("REQ-048.1, REQ-048.2, REQ-048.3, REQ-048: a password must be 12 to 128 characters, counted in code points", () => {
  expect(passwordError("correct horse battery")).toBeUndefined();
  expect(passwordError("Sh0rt!pass")).toBe("At least 12 characters");
  expect(passwordError("a".repeat(129))).toBe("Too long (max 128)");
  expect(passwordError("a".repeat(128))).toBeUndefined();
  expect(passwordError("🔒".repeat(11))).toBe("At least 12 characters");
  expect(passwordError("🔒".repeat(12))).toBeUndefined();
  expect(passwordError("🔒".repeat(128))).toBeUndefined();
  expect(passwordError("🔒".repeat(129))).toBe("Too long (max 128)");
});

it("REQ-003, M16: parseUsername lowercases 2 to 20 letters, digits or hyphens and rejects anything else", () => {
  expect(parseUsername("sam-lee2")).toBe("sam-lee2");
  expect(parseUsername("Sam")).toBe("sam");
  expect(parseUsername("s")).toBeUndefined();
  expect(parseUsername("sam lee")).toBeUndefined();
  expect(parseUsername("sam_lee")).toBeUndefined();
  expect(parseUsername("a".repeat(21))).toBeUndefined();
});