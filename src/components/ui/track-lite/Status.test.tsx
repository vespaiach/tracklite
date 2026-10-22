import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Priority, Status } from "./Status";

afterEach(cleanup);

it("Status and Priority icons are named; urgent is a plate and other levels light one bar per step", () => {
  render(
    <>
      <Status status="review" />
      <Priority priority="urgent" />
      <Priority priority="med" />
    </>,
  );
  expect(screen.getByRole("img", { name: "review" })).toBeTruthy();

  expect(screen.getByRole("img", { name: "urgent" }).textContent).toBe("!");

  const bars = [...screen.getByRole("img", { name: "med" }).querySelectorAll("i")];
  expect(bars.map((b) => b.style.opacity)).toEqual(["1", "1", "0.25"]);
});