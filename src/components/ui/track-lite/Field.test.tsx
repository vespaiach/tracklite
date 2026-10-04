import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Field, Input } from "./Field";

afterEach(cleanup);

it("links the label to the control", () => {
  render(<Field label="Email">{(props) => <Input {...props} />}</Field>);
  expect(screen.getByLabelText("Email").tagName).toBe("INPUT");
});

it("marks the control invalid and describes it with the error", () => {
  render(
    <Field
      label="Email"
      error="Enter an email address">
      {(props) => <Input {...props} />}
    </Field>,
  );
  const input = screen.getByLabelText("Email");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const errorId = input.getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(errorId)?.textContent).toContain("Enter an email address");
});

it("leaves a valid control unflagged", () => {
  render(<Field label="Email">{(props) => <Input {...props} />}</Field>);
  const input = screen.getByLabelText("Email");
  expect(input.hasAttribute("aria-invalid")).toBe(false);
  expect(input.hasAttribute("aria-describedby")).toBe(false);
});