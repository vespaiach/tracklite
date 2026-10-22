import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(cleanup);

it("renders nothing while closed and a modal named by its title when open", () => {
  const { rerender } = render(
    <Dialog
      open={false}
      onClose={() => {}}
      title="Delete label">
      Body
    </Dialog>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();

  rerender(
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

it("closes on Escape and on a press outside the panel, not inside it", () => {
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

  const dialog = screen.getByRole("dialog");
  fireEvent.mouseDown(dialog);
  expect(onClose).toHaveBeenCalledOnce();
  fireEvent.mouseDown(dialog.parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("moves focus to the first control when it opens and keeps it inside while open, even when something outside takes it", () => {
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
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

  screen.getByRole("button", { name: "Outside" }).focus();
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
});