import { expect, it } from "vitest";
import { returnTarget } from "./return-to";

it("SEC-009.1: https://evil.example, //evil.example and /\\evil.example return to /my-issues", () => {
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    expect(returnTarget(next)).toBe("/my-issues");
  }
});

it("SEC-009: a path in this app is kept; a missing next returns to /my-issues", () => {
  expect(returnTarget("/issue/WEB-42?tab=x")).toBe("/issue/WEB-42?tab=x");
  expect(returnTarget(null)).toBe("/my-issues");
});