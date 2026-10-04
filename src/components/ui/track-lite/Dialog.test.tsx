import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(cleanup);

it("renders nothing while closed", () => {
  render(
    <Dialog
      open={false}
      onClose={() => {}}
      title="Delete label">
      Body
    </Dialog>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("shows a modal dialog named by its title", () => {
  render(
    <Dialog
      open
      onClose={() => {}}
      title="Delete label">
      Body
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Delete label" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
});

it("closes on Escape", () => {
  const onClose = vi.fn();
  render(
    <Dialog
      open
      onClose={onClose}
      title="Delete label">
      Body
    </Dialog>,
  );
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("closes on a press outside the panel but not inside it", () => {
  const onClose = vi.fn();
  render(
    <Dialog
      open
      onClose={onClose}
      title="Delete label">
      Body
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.mouseDown(dialog);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(dialog.parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledOnce();
});