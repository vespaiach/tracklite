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

it("moves focus to the first control when it opens", () => {
  render(
    <Dialog
      open
      onClose={() => {}}
      title="Deactivate Alex Kim?"
      actions={<button type="button">Cancel</button>}>
      Body
    </Dialog>,
  );
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
});

it("keeps focus inside while open, even when something outside takes it", () => {
  render(
    <>
      <button type="button">Outside</button>
      <Dialog
        open
        onClose={() => {}}
        title="Deactivate Alex Kim?"
        actions={<button type="button">Cancel</button>}>
        Body
      </Dialog>
    </>,
  );
  screen.getByRole("button", { name: "Outside" }).focus();
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
});