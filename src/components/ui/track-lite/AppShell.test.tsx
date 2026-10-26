import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Crumbs, RailItem } from "./AppShell";

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

it("names the page with the last breadcrumb as its heading and hides the separators", () => {
  render(<Crumbs items={[{ label: "Website · WEB", href: "/project/WEB" }, { label: "Settings" }]} />);

  expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Website · WEB" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("Website · WEB/Settings");
  expect(screen.getByText("/").getAttribute("aria-hidden")).toBe("true");
});