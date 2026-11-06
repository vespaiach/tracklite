import { expect, it } from "vitest";
import { initials } from "./member-summary";

it("REQ-003.4: initials of long, single, bracketed, numeric and CJK names", () => {
  expect(initials("Alexandria Catherine Montgomery-Fitzwilliam van der Bergholt")).toBe("AB");
  expect(initials("Sam")).toBe("S");
  expect(initials("(Contractor) Lee")).toBe("(L");
  expect(initials("3M Team")).toBe("3T");
  expect(initials("李 小龙")).toBe("李小");
});