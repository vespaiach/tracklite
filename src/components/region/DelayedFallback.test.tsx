import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DelayedFallback } from "./DelayedFallback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("STD-7: the loading fallback shows Loading… only after 300 ms", () => {
  vi.useFakeTimers();
  render(<DelayedFallback />);

  act(() => vi.advanceTimersByTime(299));
  expect(screen.queryByText("Loading…")).toBeNull();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText("Loading…")).toBeTruthy();
});