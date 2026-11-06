import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function SaveButton({ message }: { message: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast(message)}>
      {message}
    </button>
  );
}

function toastTexts() {
  return screen.getAllByRole("status").map((toast) => toast.textContent);
}

it("STD-9.1, STD-9.2: one error toast at a time with no dismiss button; a new one replaces it and each disappears after 5 seconds", () => {
  render(
    <ToastProvider>
      <SaveButton message="Couldn’t save. Try again." />
      <SaveButton message="This project is archived" />
    </ToastProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Couldn’t save. Try again." }));
  expect(toastTexts()).toEqual(["Couldn’t save. Try again."]);
  expect(screen.getByRole("status").querySelector(".tl-toast__stripe--err")).not.toBeNull();
  expect(screen.getByRole("status").querySelector("button")).toBeNull();

  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(screen.getByRole("button", { name: "This project is archived" }));
  expect(toastTexts()).toEqual(["This project is archived"]);

  act(() => vi.advanceTimersByTime(4999));
  expect(screen.queryByRole("status")).not.toBeNull();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).toBeNull();
});