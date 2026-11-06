import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { admin, alex, apiError, mockApi, project, renderAppAt } from "../../test/client-app";
import type { Me, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const web = project("WEB", "Website");
const old = project("OLD", "Old site", "2025-09-14T10:00:00.000Z");

function mockProject(shown: Project, me: Me = admin) {
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "GET /api/members": () => Response.json([]),
    [`GET /api/projects/${shown.key}`]: () => Response.json(shown),
    [`GET /api/projects/${shown.key}/labels`]: () => Response.json([]),
    "GET /api/projects/NOPE": () => apiError(404, "Not found"),
  });
}

function header() {
  return screen.getByRole("banner");
}

it("REQ-046.1: the labels page's header shows the details button, the name, the view tabs and, for admins, the settings gear", async () => {
  mockProject(web);
  renderAppAt("/project/WEB/labels");

  expect(await screen.findByRole("heading", { name: "Website · WEB" })).toBeTruthy();
  const details = within(header()).getByRole("link", { name: "Project details" });
  expect(details.getAttribute("href")).toBe("/project/WEB/detail");
  const views = within(header()).getByRole("navigation", { name: "Project views" });
  expect(within(views).getByRole("link", { name: "Labels" }).getAttribute("aria-current")).toBe("page");
  expect(within(views).getByRole("link", { name: "Board" }).getAttribute("href")).toBe("/project/WEB");
  expect(within(views).getByRole("link", { name: "List" }).getAttribute("href")).toBe("/project/WEB/list");
  expect(within(header()).getByRole("link", { name: "Project settings" }).getAttribute("href")).toBe(
    "/project/WEB/settings",
  );
  expect(
    within(header())
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label") ?? link.textContent),
  ).toEqual(["Project details", "Board", "List", "Labels", "Project settings"]);
});

it("STD-2, REQ-013.1: a member sees no settings gear; an archived project's header shows the Archived badge", async () => {
  mockProject(old, alex);
  renderAppAt("/project/OLD/labels");

  await screen.findByRole("heading", { name: "Old site · OLD" });
  expect(within(header()).queryByRole("link", { name: "Project settings" })).toBeNull();
  expect(within(header()).getByText("Archived")).toBeTruthy();
});

it("STD-4: an unknown project key shows Not found", async () => {
  mockProject(web);
  renderAppAt("/project/NOPE/labels");

  expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
});