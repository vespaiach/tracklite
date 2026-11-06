import { expect, it } from "vitest";
import { returnTarget } from "./return-to";

it("SEC-009, SEC-009.1: only an in-app path is kept; external, protocol-relative, backslash and missing next go to /my-issues", () => {
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    expect(returnTarget(next)).toBe("/my-issues");
  }

  expect(returnTarget("/issue/WEB-42?tab=x")).toBe("/issue/WEB-42?tab=x");
  expect(returnTarget(null)).toBe("/my-issues");
});