import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Field, FieldError, Input } from "./Field";

afterEach(cleanup);

const help = "12 to 128 characters. Spaces count.";

it("Field: help, then error, then neither, sets aria-invalid and aria-describedby, and an error replaces the help", () => {
  const { rerender } = render(
    <Field
      label="New password"
      help={help}>
      {(props) => <Input {...props} />}
    </Field>,
  );
  const input = () => screen.getByLabelText("New password");
  expect(input().tagName).toBe("INPUT");
  const helpId = input().getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(helpId)?.textContent).toBe(help);
  expect(input().hasAttribute("aria-invalid")).toBe(false);

  rerender(
    <Field
      label="New password"
      help={help}
      error="At least 12 characters">
      {(props) => <Input {...props} />}
    </Field>,
  );
  expect(input().getAttribute("aria-invalid")).toBe("true");
  const errorId = input().getAttribute("aria-describedby") ?? "";
  expect(document.getElementById(errorId)?.textContent).toContain("At least 12 characters");
  expect(screen.queryByText(help)).toBeNull();

  rerender(<Field label="New password">{(props) => <Input {...props} />}</Field>);
  expect(input().hasAttribute("aria-invalid")).toBe(false);
  expect(input().hasAttribute("aria-describedby")).toBe(false);
});

it("STD-3: FieldError shows its round mark hidden from assistive tech", () => {
  render(<FieldError>Name required</FieldError>);
  const mark = screen.getByText("!");
  expect(mark.getAttribute("aria-hidden")).toBe("true");
  expect(mark.classList.contains("tl-field-error__mark")).toBe(true);
  expect(mark.parentElement?.textContent).toBe("!Name required");
});