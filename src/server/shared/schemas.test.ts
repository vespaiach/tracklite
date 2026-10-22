import * as v from "valibot";
import { expect, it } from "vitest";
import { requestId } from "./schemas";

it("STD-5, M16: a requestId must be a UUID", () => {
  expect(v.parse(requestId, "0b0e6a2c-5d1f-4c8e-9a3b-2f4d6e8a1c3b")).toBe(
    "0b0e6a2c-5d1f-4c8e-9a3b-2f4d6e8a1c3b",
  );
  expect(v.safeParse(requestId, "retry-1").issues?.[0].message).toBe("Invalid request");
  expect(v.safeParse(requestId, 42).issues?.[0].message).toBe("Invalid request");
});