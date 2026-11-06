import { expect, it } from "vitest";
import Page from "./page";

it("M0.4, STD-4: an address that matches no page shows Not found inside the signed-in layout", () => {
  expect(() => Page()).toThrow("NEXT_NOT_FOUND");
});