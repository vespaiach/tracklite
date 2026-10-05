import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

it("danger variant renders the tl-btn--danger class and stays a type=button that can be disabled", () => {
  render(
    <Button
      variant="danger"
      disabled>
      Deactivate
    </Button>,
  );

  const button = screen.getByRole("button", { name: "Deactivate" }) as HTMLButtonElement;
  expect(button.className.split(" ")).toEqual(["tl-btn", "tl-btn--md", "tl-btn--danger"]);
  expect(button.type).toBe("button");
  expect(button.disabled).toBe(true);
});