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