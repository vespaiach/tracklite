import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  apiError,
  issue,
  mockApi,
  never,
  networkError,
  project,
  renderAppAt,
  requestsTo,
  sam,
} from "../test/client-app";
import type { Project } from "./api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const created = issue({ id: "WEB-1", status: "backlog", priority: "none", assignee: null });

function mockProject({ post, shown = web }: { post?: Answer; shown?: Project } = {}) {
  return mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json([sam]),
    "GET /api/projects/WEB": () => Response.json(shown),
    "POST /api/projects/WEB/issues": post ?? (() => Response.json(created, { status: 201 })),
    "GET /api/issues/WEB-1": () => Response.json(created),
  });
}

async function openDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "New issue" }));
  return screen.getByRole("dialog", { name: "New issue" });
}

function typeTitle(dialog: HTMLElement, value: string) {
  const title = within(dialog).getByRole("textbox", { name: "Title" }) as HTMLInputElement;
  fireEvent.change(title, { target: { value } });
  return title;
}

it("REQ-016.1: creating an issue opens it as Backlog, No priority and unassigned", async () => {
  const fetchMock = mockProject();
  renderAppAt("/project/WEB");

  const dialog = await openDialog();
  typeTitle(dialog, "Fix login button");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  await waitFor(() => expect(window.location.pathname).toBe("/issue/WEB-1"));
  const [body] = requestsTo(fetchMock, "POST /api/projects/WEB/issues") as {
    requestId: string;
    title: string;
  }[];
  expect(body.title).toBe("Fix login button");
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect((await screen.findByRole("button", { name: /^Status/ })).textContent).toContain("Backlog");
  expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("No priority");
  expect(screen.getByRole("button", { name: /^Assignee/ }).textContent).toContain("Unassigned");
  expect(screen.getByText(/Created by Sam Lee/)).toBeTruthy();
});

it("REQ-016.3: a title of only spaces gets Title required and keeps what was typed", async () => {
  mockProject({ post: () => apiError(422, "Check the highlighted fields", { title: "Title required" }) });
  renderAppAt("/project/WEB");

  const dialog = await openDialog();
  const title = typeTitle(dialog, "   ");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await within(dialog).findByText("Title required")).toBeTruthy();
  expect(title.value).toBe("   ");
  expect(title.getAttribute("aria-invalid")).toBe("true");
});

it("STD-5: Create is disabled while the issue is saving", async () => {
  mockProject({ post: never });
  renderAppAt("/project/WEB");

  const dialog = await openDialog();
  typeTitle(dialog, "Fix login button");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  const saving = await within(dialog).findByRole("button", { name: "Creating…" });
  expect((saving as HTMLButtonElement).disabled).toBe(true);
});

it("STD-5: retrying after a failed create sends the same requestId", async () => {
  let attempts = 0;
  const fetchMock = mockProject({
    post: () => {
      attempts += 1;
      return attempts === 1 ? networkError() : Response.json(created, { status: 201 });
    },
  });
  renderAppAt("/project/WEB");

  const dialog = await openDialog();
  typeTitle(dialog, "Fix login button");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  await waitFor(() => expect(window.location.pathname).toBe("/issue/WEB-1"));
  const [first, second] = requestsTo(fetchMock, "POST /api/projects/WEB/issues") as { requestId: string }[];
  expect(second.requestId).toBe(first.requestId);
});

it("STD-9: a server error shows the toast and keeps the title", async () => {
  mockProject({ post: () => apiError(500, "Internal error") });
  renderAppAt("/project/WEB");

  const dialog = await openDialog();
  const title = typeTitle(dialog, "Fix login button");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect(title.value).toBe("Fix login button");
  expect(window.location.pathname).toBe("/project/WEB");
});

it("REQ-013: an archived project's header has no New issue", async () => {
  mockProject({ shown: project("WEB", "Website", "2026-10-01T10:00:00.000Z") });
  renderAppAt("/project/WEB");

  expect(await screen.findByText("Archived")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New issue" })).toBeNull();
});