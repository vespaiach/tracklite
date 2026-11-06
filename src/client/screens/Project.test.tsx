import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { admin, alex, issue, mockApi, project, renderAppAt } from "../../test/client-app";
import type { Me, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const web = project("WEB", "Website");
const archivedWeb = project("WEB", "Website", "2025-09-14T10:00:00.000Z");

function mockIssuePage(shown: Project, me: Me = admin) {
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "GET /api/members": () => Response.json([]),
    "GET /api/projects/WEB": () => Response.json(shown),
    "GET /api/projects/WEB/labels": () => Response.json([]),
    "GET /api/issues/WEB-42": () => Response.json(issue({ archived: shown.archivedAt !== null })),
    "GET /api/issues/WEB-42/comments": () => Response.json([]),
  });
}

function header() {
  return screen.getByRole("banner");
}

it("REQ-046.1: the issue page's header shows the details button, the project, the view tabs as page loads and, for admins, the settings gear", async () => {
  mockIssuePage(web);
  renderAppAt("/issue/WEB-42");

  const views = await screen.findByRole("navigation", { name: "Project views" });
  expect(within(header()).getByRole("link", { name: "Project details" }).getAttribute("href")).toBe(
    "/project/WEB/detail",
  );
  expect(
    within(views)
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")]),
  ).toEqual([
    ["Board", "/project/WEB", null],
    ["List", "/project/WEB/list", null],
    ["Labels", "/project/WEB/labels", null],
  ]);
  expect(within(header()).getByRole("link", { name: "Project settings" }).getAttribute("href")).toBe(
    "/project/WEB/settings",
  );
});

it("STD-2, REQ-013.1: a member sees no settings gear; an archived project's header shows the Archived badge", async () => {
  mockIssuePage(archivedWeb, alex);
  renderAppAt("/issue/WEB-42");

  await screen.findByRole("navigation", { name: "Project views" });
  expect(within(header()).queryByRole("link", { name: "Project settings" })).toBeNull();
  expect(within(header()).getByText("Archived")).toBeTruthy();
});