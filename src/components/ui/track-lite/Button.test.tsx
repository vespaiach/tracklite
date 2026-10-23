import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

it("Button defaults to type=button and can be disabled; the danger variant adds tl-btn--danger", () => {
  render(
    <Button
      variant="danger"
      disabled>
      Deactivate
    </Button>,
  );

  const button = screen.getByRole("button", { name: "Deactivate" }) as HTMLButtonElement;
  expect(button.type).toBe("button");
  expect(button.disabled).toBe(true);
  expect(button.classList.contains("tl-btn--danger")).toBe(true);
});

it("Button: a busy label replaces the text and disables the button until busy clears", () => {
  const { rerender } = render(<Button busy="Saving…">Save</Button>);
  const button = screen.getByRole("button") as HTMLButtonElement;
  expect(button.textContent).toBe("Saving…");
  expect(button.disabled).toBe(true);

  rerender(<Button>Save</Button>);
  expect(button.textContent).toBe("Save");
  expect(button.disabled).toBe(false);
});