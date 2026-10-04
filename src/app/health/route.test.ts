import { afterEach, expect, it, vi } from "vitest";
import { db } from "../../server/db";
import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

it("OPS-005: /health answers 200 when the database responds", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
});

it("OPS-005.1: /health answers 503 when the database doesn't respond", async () => {
  vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
  const response = await GET();
  expect(response.status).toBe(503);
});