import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useRequestId } from "./useRequestId";

it("STD-5: a create form keeps one request ID for every retry and gets a new one when it is reset", () => {
  const { result, rerender } = renderHook(() => useRequestId());
  const [first] = result.current;

  rerender();
  expect(result.current[0]).toBe(first);
  expect(first).toMatch(/^[0-9a-f-]{36}$/);

  act(() => result.current[1]());
  expect(result.current[0]).not.toBe(first);
});