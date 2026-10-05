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

it("Field: help text shows under the control and is linked by aria-describedby", () => {
  render(
    <Field
      label="New password"
      help="12 to 128 characters. Spaces count.">
      {(props) => <Input {...props} />}
    </Field>,
  );
  const input = screen.getByLabelText("New password");
  const helpId = input.getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(helpId)?.textContent).toBe("12 to 128 characters. Spaces count.");
  expect(input.hasAttribute("aria-invalid")).toBe(false);
});

it("Field: an error replaces the help text", () => {
  render(
    <Field
      label="New password"
      help="12 to 128 characters. Spaces count."
      error="At least 12 characters">
      {(props) => <Input {...props} />}
    </Field>,
  );
  const input = screen.getByLabelText("New password");
  const describedBy = input.getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(describedBy)?.textContent).toContain("At least 12 characters");
  expect(screen.queryByText("12 to 128 characters. Spaces count.")).toBeNull();
});