import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("API-001: an unknown /api path answers 401 while signed out", async () => {
  const response = await GET(new Request("http://localhost:3000/api/anything"));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { message: "Sign in to continue." } });
});

it("API-001: a same-site write to an unknown /api path answers 401", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/anything", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(401);
});