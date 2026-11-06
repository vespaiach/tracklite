import { expect, it } from "vitest";
import { parseUuid } from "./ids";

it("M16: parseUuid accepts a UUID in either case and rejects anything else", () => {
  expect(parseUuid("0b0e6a2c-5d1f-4c8e-9a3b-2f4d6e8a1c3b")).toBe("0b0e6a2c-5d1f-4c8e-9a3b-2f4d6e8a1c3b");
  expect(parseUuid("0B0E6A2C-5D1F-4C8E-9A3B-2F4D6E8A1C3B")).toBe("0B0E6A2C-5D1F-4C8E-9A3B-2F4D6E8A1C3B");
  expect(parseUuid("not-a-uuid")).toBeUndefined();
  expect(parseUuid("0b0e6a2c5d1f4c8e9a3b2f4d6e8a1c3b")).toBeUndefined();
  expect(parseUuid("")).toBeUndefined();
});