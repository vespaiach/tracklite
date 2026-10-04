import { expect, it } from "vitest";
import { initials } from "./members";

it.each([
  ["Alexandria Catherine Montgomery-Fitzwilliam van der Bergholt", "AB"],
  ["Sam", "S"],
  ["(Contractor) Lee", "(L"],
  ["3M Team", "3T"],
  ["李 小龙", "李小"],
])('REQ-003.4: the initials of "%s" are "%s"', (fullName, expected) => {
  expect(initials(fullName)).toBe(expected);
});