import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { createMemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeStore } from "./store";
import { showToast } from "./toast";
import { Toaster } from "./Toaster";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderToaster() {
  const store = makeStore(createMemoryRouter([{ path: "*" }]));
  render(
    <Provider store={store}>
      <Toaster />
    </Provider>,
  );
  return store;
}

it("STD-9.1: a failed submit shows one error toast that disappears after 5 seconds", () => {
  const store = renderToaster();

  act(() => {
    store.dispatch(showToast("Couldn't save. Try again."));
  });

  expect(screen.getAllByRole("status").map((toast) => toast.textContent)).toEqual([
    "Couldn't save. Try again.",
  ]);
  expect(screen.queryByRole("button")).toBeNull();

  act(() => {
    vi.advanceTimersByTime(4999);
  });
  expect(screen.queryByRole("status")).not.toBeNull();

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByRole("status")).toBeNull();
});

it("STD-9.2: a new toast replaces the current one", () => {
  const store = renderToaster();

  act(() => {
    store.dispatch(showToast("This issue was deleted"));
  });
  act(() => {
    vi.advanceTimersByTime(3000);
    store.dispatch(showToast("This project is archived"));
  });

  expect(screen.getAllByRole("status").map((toast) => toast.textContent)).toEqual([
    "This project is archived",
  ]);

  act(() => {
    vi.advanceTimersByTime(4999);
  });
  expect(screen.queryByRole("status")).not.toBeNull();

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByRole("status")).toBeNull();
});