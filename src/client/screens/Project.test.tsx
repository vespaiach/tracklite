import { cleanup, screen, waitFor, within } from "@testing-library/react";
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
    [`GET /api/projects/${shown.key}`]: () => Response.json(shown),
    "GET /api/projects/NOPE": () => apiError(404, "Not found"),
  });
}

function header() {
  return screen.getByRole("banner");
}

it("shows the project header with its views and, for admins, the settings gear", async () => {
  mockProject(web);
  renderAppAt("/project/WEB");

  expect(await screen.findByRole("heading", { name: "Website · WEB" })).toBeTruthy();
  expect(within(header()).getByRole("link", { name: "Details" }).getAttribute("href")).toBe(
    "/project/WEB/detail",
  );
  const views = within(header()).getByRole("navigation", { name: "Project views" });
  expect(within(views).getByRole("link", { name: "Board" }).getAttribute("aria-current")).toBe("page");
  expect(within(views).getByRole("link", { name: "List" }).getAttribute("href")).toBe("/project/WEB/list");
  expect(within(header()).getByRole("link", { name: "Labels" }).getAttribute("href")).toBe(
    "/project/WEB/labels",
  );
  expect(within(header()).getByRole("link", { name: "Project settings" }).getAttribute("href")).toBe(
    "/project/WEB/settings",
  );
});

it("STD-2, REQ-013.1: a member sees no settings gear; an archived project's header shows the Archived badge", async () => {
  mockProject(old, alex);
  renderAppAt("/project/OLD");

  await screen.findByRole("heading", { name: "Old site · OLD" });
  expect(within(header()).queryByRole("link", { name: "Project settings" })).toBeNull();
  expect(within(header()).getByText("Archived")).toBeTruthy();
});

it("STD-4: an unknown project key shows Not found", async () => {
  mockProject(web);
  renderAppAt("/project/NOPE");

  expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
});

function mockLowerCaseProject() {
  return mockApi({
    "GET /api/me": () => Response.json(admin),
    "GET /api/projects/web": () => Response.json(web),
    "GET /api/projects/WEB": () => Response.json(web),
    "GET /api/projects/WEB/labels": () => Response.json([]),
    "GET /api/members": () => Response.json([]),
    "GET /api/projects/WEB/board": () => Response.json([]),
    "GET /api/projects/WEB/issues?status=done": () =>
      Response.json({ issues: [], hasMore: false, deactivatedAssignees: [] }),
  });
}

it("API-004: /project/web opens WEB and the address becomes /project/WEB", async () => {
  mockLowerCaseProject();
  renderAppAt("/project/web");

  expect(await screen.findByRole("heading", { name: "Website · WEB" })).toBeTruthy();
  await waitFor(() => expect(window.location.pathname).toBe("/project/WEB"));
});

it("API-004: /project/web/list?status=done keeps its path and filters when made canonical", async () => {
  mockLowerCaseProject();
  renderAppAt("/project/web/list?status=done#top");

  const views = await screen.findByRole("navigation", { name: "Project views" });
  await waitFor(() => expect(window.location.pathname).toBe("/project/WEB/list"));
  expect(window.location.search).toBe("?status=done");
  expect(window.location.hash).toBe("#top");
  expect(within(views).getByRole("link", { name: "List" }).getAttribute("aria-current")).toBe("page");
  expect(within(views).getByRole("link", { name: "Board" }).hasAttribute("aria-current")).toBe(false);
});