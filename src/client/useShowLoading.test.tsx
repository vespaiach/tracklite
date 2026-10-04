import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useShowLoading } from "./useShowLoading";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("STD-7: the loading indicator shows only after 300 ms pending", () => {
  const { result } = renderHook(() => useShowLoading(true));

  act(() => {
    vi.advanceTimersByTime(299);
  });
  expect(result.current).toBe(false);

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(result.current).toBe(true);
});

it("STD-7: a request that finishes within 300 ms never shows the loading indicator", () => {
  const { result, rerender } = renderHook(({ pending }) => useShowLoading(pending), {
    initialProps: { pending: true },
  });

  act(() => {
    vi.advanceTimersByTime(200);
  });
  rerender({ pending: false });
  act(() => {
    vi.advanceTimersByTime(500);
  });

  expect(result.current).toBe(false);
});

it("STD-7: the loading indicator hides once the request finishes", () => {
  const { result, rerender } = renderHook(({ pending }) => useShowLoading(pending), {
    initialProps: { pending: true },
  });

  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(result.current).toBe(true);

  rerender({ pending: false });
  expect(result.current).toBe(false);
});