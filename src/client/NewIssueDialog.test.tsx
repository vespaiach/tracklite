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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const created = issue({ id: "WEB-1", status: "backlog", priority: "none", assignee: null });

function mockProject({ post }: { post?: Answer } = {}) {
  return mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json([sam]),
    "GET /api/projects/WEB": () => Response.json(web),
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
  expect((await screen.findByRole("button", { name: /^Assignee/ })).textContent).toContain("Unassigned");
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

it("STD-5, STD-9: a failed create shows the toast and keeps the title; the retry reuses the requestId and shows Creating… disabled", async () => {
  const answers: Answer[] = [networkError, never];
  const fetchMock = mockProject({ post: (body) => (answers.shift() as Answer)(body) });
  renderAppAt("/project/WEB");

  const dialog = await openDialog();
  const title = typeTitle(dialog, "Fix login button");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect(title.value).toBe("Fix login button");
  expect(window.location.pathname).toBe("/project/WEB");

  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  const saving = await within(dialog).findByRole("button", { name: "Creating…" });
  expect((saving as HTMLButtonElement).disabled).toBe(true);
  const [first, second] = requestsTo(fetchMock, "POST /api/projects/WEB/issues") as { requestId: string }[];
  expect(second.requestId).toBe(first.requestId);
});