import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "./not-found";

it("M0.4, STD-4: Not found has a “Go to My issues” link that loads /my-issues", () => {
  render(<NotFound />);

  expect(screen.getByRole("heading", { name: "Not found" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to My issues" }).getAttribute("href")).toBe("/my-issues");
});