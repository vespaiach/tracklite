import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Priority, Status } from "./Status";

afterEach(cleanup);

it("names the status for assistive tech", () => {
  render(<Status status="review" />);
  expect(screen.getByRole("img", { name: "review" })).toBeTruthy();
});

it("draws urgent priority as a plate instead of bars", () => {
  render(<Priority priority="urgent" />);
  expect(screen.getByRole("img", { name: "urgent" }).textContent).toBe("!");
});

it("lights one bar per priority step", () => {
  render(<Priority priority="med" />);
  const bars = [...screen.getByRole("img", { name: "med" }).querySelectorAll("i")];
  expect(bars.map((b) => b.style.opacity)).toEqual(["1", "1", "0.25"]);
});