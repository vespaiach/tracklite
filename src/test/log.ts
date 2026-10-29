import { vi } from "vitest";

export function spyOnLoggedErrors() {
  const write = vi.spyOn(console, "error").mockImplementation(() => {});
  return () =>
    write.mock.calls.map(([raw]) => JSON.parse(String(raw))).filter((line) => line.level === "error");
}