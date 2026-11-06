import { refresh } from "next/cache";
import { beforeEach, vi } from "vitest";
import { setNextRequest } from "./next-request";

vi.mock("next/headers", () => import("./next-request"));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

beforeEach(() => {
  setNextRequest({});
  vi.mocked(refresh).mockClear();
});