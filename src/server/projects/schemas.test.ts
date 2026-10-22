import { expect, it } from "vitest";
import { parseProjectKey } from "./schemas";

it("REQ-009.4, M16: parseProjectKey uppercases 2 to 5 letters and rejects anything else", () => {
  expect(parseProjectKey("WEB")).toBe("WEB");
  expect(parseProjectKey("web")).toBe("WEB");
  expect(parseProjectKey("W")).toBeUndefined();
  expect(parseProjectKey("WEB1")).toBeUndefined();
  expect(parseProjectKey("ÉQ")).toBeUndefined();
  expect(parseProjectKey("WEBSIT")).toBeUndefined();
});