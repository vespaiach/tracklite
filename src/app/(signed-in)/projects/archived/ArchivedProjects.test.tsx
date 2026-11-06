import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArchivedProjects } from "./ArchivedProjects";

afterEach(cleanup);

it("REQ-013: with no archived projects the list says “No archived projects.”", () => {
  render(<ArchivedProjects projects={[]} />);

  expect(screen.getByText("No archived projects.")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});

it("REQ-013.1: an archived project is listed as “Name · KEY” with its archived date and opens its board", () => {
  render(
    <ArchivedProjects
      projects={[{ key: "OLD", name: "Old site", archivedAt: "2025-09-14T10:00:00.000Z" }]}
    />,
  );

  const table = screen.getByRole("table", { name: "Archived projects" });
  expect(within(table).getByRole("link", { name: "Old site · OLD" }).getAttribute("href")).toBe(
    "/project/OLD",
  );
  expect(within(table).getByText("Sep 14, 2025")).toBeTruthy();
});