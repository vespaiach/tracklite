import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RailItem } from "./AppShell";

afterEach(cleanup);

it("shows a rail item's name and suffix apart, titled with both unless the title is cleared", () => {
  const { rerender } = render(
    <RailItem
      href="/project/WEB/board"
      icon={null}
      label="Website"
      suffix=" · WEB"
    />,
  );
  const link = screen.getByRole("link");
  expect(screen.getByText("Website")).toBeTruthy();
  expect(screen.getByText("· WEB", { normalizer: (text) => text.trim() })).toBeTruthy();
  expect(link.getAttribute("title")).toBe("Website · WEB");

  rerender(
    <RailItem
      href="/project/WEB/board"
      icon={null}
      label="Website"
      suffix=" · WEB"
      title=""
    />,
  );
  expect(screen.getByRole("link").hasAttribute("title")).toBe(false);
});