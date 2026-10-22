import { afterEach, expect, it, vi } from "vitest";
import { db } from "../../server/db";
import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

it("OPS-005, OPS-005.1: /health answers 200 when the database responds and 503 when it doesn't", async () => {
  expect((await GET()).status).toBe(200);

  vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
  expect((await GET()).status).toBe(503);
});