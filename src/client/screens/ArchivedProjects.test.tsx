import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { alex, apiError, mockApi, project, renderAppAt, summary } from "../../test/client-app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = () => Response | Promise<Response>;

const old = project("OLD", "Old site", "2025-09-14T10:00:00.000Z");

function mockArchived(list: Answer) {
  return mockApi({
    "GET /api/me": () => Response.json(alex),
    "GET /api/projects?archived=true": list,
  });
}

it("REQ-013: with no archived projects the list says “No archived projects.”", async () => {
  mockArchived(() => Response.json([]));
  renderAppAt("/projects/archived");

  expect(await screen.findByText("No archived projects.")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});

it("REQ-013.1: an archived project is listed as “Name · KEY” with its archived date and opens its board", async () => {
  mockArchived(() => Response.json([summary(old)]));
  renderAppAt("/projects/archived");

  const table = await screen.findByRole("table", { name: "Archived projects" });
  expect(within(table).getByRole("link", { name: "Old site · OLD" }).getAttribute("href")).toBe(
    "/project/OLD",
  );
  expect(within(table).getByText("Sep 14, 2025")).toBeTruthy();
});

it("STD-7: a load failure shows “Couldn't load this.” with Retry", async () => {
  let fail = true;
  mockArchived(() => (fail ? apiError(500, "Internal error") : Response.json([summary(old)])));
  renderAppAt("/projects/archived");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await screen.findByRole("link", { name: "Old site · OLD" })).toBeTruthy();
});