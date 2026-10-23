import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SignedOutLayout } from "./SignedOut";

afterEach(cleanup);

it("SignedOutLayout shows the signed-out Logo in its banner", () => {
  render(<SignedOutLayout>content</SignedOutLayout>);

  const banner = screen.getByRole("banner");
  expect(banner.textContent).toBe("Tracklite");
  expect(banner.querySelector(".tl-logo--signed-out")).toBeTruthy();
});