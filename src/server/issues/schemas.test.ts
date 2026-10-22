import { expect, it } from "vitest";
import { parseIssueId } from "./schemas";

it("REQ-016.5, M16: parseIssueId uppercases a key and number and rejects anything else", () => {
  expect(parseIssueId("WEB-42")).toBe("WEB-42");
  expect(parseIssueId("web-42")).toBe("WEB-42");
  expect(parseIssueId("WEB-0")).toBeUndefined();
  expect(parseIssueId("WEB-042")).toBeUndefined();
  expect(parseIssueId("WEB42")).toBeUndefined();
  expect(parseIssueId("W-42")).toBeUndefined();
  expect(parseIssueId("WEB-1234567890")).toBeUndefined();
});