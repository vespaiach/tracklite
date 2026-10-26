import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Priority, Status } from "./Status";

afterEach(cleanup);

it("Status and Priority icons are named and draw Docket's Lucide glyph for their level", () => {
  render(
    <>
      <Status status="review" />
      <Priority priority="urgent" />
      <Priority priority="med" />
    </>,
  );

  expect(screen.getByRole("img", { name: "review" }).querySelector("svg.lucide-circle-dot")).toBeTruthy();
  expect(screen.getByRole("img", { name: "urgent" }).querySelector("svg.lucide-circle-alert")).toBeTruthy();
  expect(screen.getByRole("img", { name: "med" }).querySelector("svg.lucide-signal-medium")).toBeTruthy();
});