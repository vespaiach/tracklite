import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectSummary } from "../../../../contract";
import { renderForm } from "../../../../test/forms";
import { ProjectHeader } from "./ProjectHeader";

const navigation = vi.hoisted(() => ({ segment: null as string | null }));
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => navigation.segment }));

afterEach(() => {
  cleanup();
  navigation.segment = null;
});

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
const old: ProjectSummary = { key: "OLD", name: "Old site", archivedAt: "2025-09-14T10:00:00.000Z" };

function renderHeader(project: ProjectSummary, admin: boolean, issue?: { id: string; title: string }) {
  renderForm(
    <ProjectHeader
      project={project}
      issue={issue}
      admin={admin}
      members={[]}
      me="sam"
      createIssue={vi.fn()}
    />,
  );
  return within(screen.getByRole("banner"));
}

it("REQ-046.1: the header shows the details button, the name, the view tabs, New issue and, for admins, the settings gear; the board is the current view", () => {
  const header = renderHeader(web, true);

  expect(header.getByRole("heading", { name: "Website · WEB" })).toBeTruthy();
  const details = header.getByRole("link", { name: "Project details" });
  expect(details.getAttribute("href")).toBe("/project/WEB/detail");
  expect(details.hasAttribute("aria-current")).toBe(false);
  const views = within(header.getByRole("navigation", { name: "Project views" }));
  expect(views.getByRole("link", { name: "Board" }).getAttribute("aria-current")).toBe("page");
  expect(views.getByRole("link", { name: "List" }).getAttribute("href")).toBe("/project/WEB/list");
  expect(views.getByRole("link", { name: "Labels" }).getAttribute("href")).toBe("/project/WEB/labels");
  expect(header.getByRole("link", { name: "Project settings" }).getAttribute("href")).toBe(
    "/project/WEB/settings",
  );
  expect(
    header.getAllByRole("link").map((link) => link.getAttribute("aria-label") ?? link.textContent),
  ).toEqual(["Project details", "Board", "List", "Labels", "Project settings"]);
  expect(header.getByRole("button", { name: "New issue" })).toBeTruthy();
});

it("REQ-046.1: the current view follows the page below the layout", () => {
  navigation.segment = "list";
  const header = renderHeader(web, false);

  const views = within(header.getByRole("navigation", { name: "Project views" }));
  expect(views.getByRole("link", { name: "List" }).getAttribute("aria-current")).toBe("page");
  expect(views.getByRole("link", { name: "Board" }).hasAttribute("aria-current")).toBe(false);
});

it("STD-2, REQ-013.1, REQ-013.4: a member sees no settings gear; an archived project's header shows the Archived badge and no New issue", () => {
  const header = renderHeader(old, false);

  expect(header.queryByRole("link", { name: "Project settings" })).toBeNull();
  expect(header.getByText("Archived")).toBeTruthy();
  expect(header.queryByRole("button", { name: "New issue" })).toBeNull();
});

it("REQ-046: on an issue page the header shows the breadcrumb to the project and no view selected", () => {
  navigation.segment = "issue";
  const header = renderHeader(web, false, { id: "WEB-42", title: "Fix login button" });

  const crumbs = within(header.getByRole("navigation", { name: "Breadcrumb" }));
  expect(crumbs.getByRole("link", { name: "Project details" }).getAttribute("href")).toBe(
    "/project/WEB/detail",
  );
  expect(crumbs.getByRole("link", { name: "Website · WEB" }).getAttribute("href")).toBe("/project/WEB");
  const current = crumbs.getByText("WEB-42");
  expect(current.getAttribute("aria-current")).toBe("page");
  expect(current.getAttribute("title")).toBe("Fix login button");
  const views = within(header.getByRole("navigation", { name: "Project views" }));
  expect(views.queryAllByRole("link", { current: "page" })).toEqual([]);
});