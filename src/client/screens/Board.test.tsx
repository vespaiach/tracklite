import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  alex,
  apiError,
  issue,
  memberOf,
  mockApi,
  networkError,
  never,
  project,
  renderAppAt,
  requestsTo,
  sam,
} from "../../test/client-app";
import type { Board, BoardIssue, IssueLabel, IssueStatus, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const archivedWeb = project("WEB", "Website", "2026-09-30T10:00:00.000Z");

function labels(...names: string[]): IssueLabel[] {
  return names.map((name) => ({ id: `l-${name.toLowerCase()}`, name, color: "gray" }));
}

function card(id: string, title: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return { id, title, priority: "medium", assignee: memberOf(alex), labels: [], ...overrides };
}

const web42 = card("WEB-42", "Fix login button", {
  priority: "high",
  assignee: memberOf(sam),
  labels: labels("backend", "bug", "Design", "docs", "frontend"),
});
const web7 = card("WEB-7", "Add password rules to the reset form", { labels: labels("frontend") });
const web12 = card("WEB-12", "Tidy up footer links", { priority: "none", assignee: null });
const web5 = card("WEB-5", "Email digest sends twice on Mondays", { priority: "urgent" });
const web9 = card("WEB-9", "Show the project key in the browser tab title");

function board(columns: Partial<Record<IssueStatus, BoardIssue[]>>): Board {
  const order: IssueStatus[] = ["backlog", "in_progress", "in_review", "done", "canceled"];
  return order.map((status) => {
    const cards = columns[status] ?? [];
    return { status, count: cards.length, cards };
  });
}

const webBoard = board({ backlog: [web42, web7, web12], in_progress: [web5, web9] });

function mockBoard({
  shown = web,
  columns = webBoard,
  getBoard,
  move,
  post,
}: {
  shown?: Project;
  columns?: Board;
  getBoard?: Answer;
  move?: (id: string, body: { status: IssueStatus; place: unknown }) => Board | Response | Promise<Response>;
  post?: Answer;
} = {}) {
  let current = columns;
  const moveRoute = (id: string) => (body: unknown) => {
    const answer = move?.(id, body as { status: IssueStatus; place: unknown }) ?? current;
    if (!Array.isArray(answer)) return answer;
    current = answer;
    return Response.json(issue({ id, status: (body as { status: IssueStatus }).status }));
  };
  return mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json([sam, alex]),
    "GET /api/projects/WEB": () => Response.json(shown),
    "GET /api/projects/WEB/board": getBoard ?? (() => Response.json(current)),
    "PUT /api/issues/WEB-42/position": moveRoute("WEB-42"),
    "PUT /api/issues/WEB-5/position": moveRoute("WEB-5"),
    "PUT /api/issues/WEB-7/position": moveRoute("WEB-7"),
    "PUT /api/issues/WEB-12/position": moveRoute("WEB-12"),
    "POST /api/projects/WEB/issues":
      post ?? (() => Response.json(issue({ id: "WEB-43", status: "in_review" }), { status: 201 })),
    "GET /api/issues/WEB-43": () => Response.json(issue({ id: "WEB-43", status: "in_review" })),
  });
}

function column(name: string) {
  return screen.getByRole("region", { name });
}

function cardIn(columnName: string, title: string) {
  return within(column(columnName)).getByRole("article", { name: title });
}

function titlesIn(columnName: string) {
  return within(column(columnName))
    .queryAllByRole("article")
    .map((article) => within(article).getByRole("link").textContent);
}

async function openCardMenu(id: string) {
  fireEvent.click(await screen.findByRole("button", { name: `${id} actions` }));
  return screen.findByRole("menu");
}

async function openSubmenu(menu: HTMLElement) {
  const moveTo = within(menu).getByRole("menuitem", { name: "Move to" });
  moveTo.focus();
  fireEvent.keyDown(moveTo, { key: "ArrowRight" });
  return (await screen.findAllByRole("menu"))[1];
}

async function openMoveTo(id: string) {
  return openSubmenu(await openCardMenu(id));
}

async function press(key: string) {
  fireEvent.keyDown(document.activeElement as HTMLElement, { key });
  fireEvent.keyUp(document.activeElement as HTMLElement, { key });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function dragByKeyboard(title: string, columnName: string, target: string) {
  const handle = await screen.findByRole("button", { name: `Drag ${title}` });
  const destination = column(columnName);
  act(() => handle.focus());
  for (let step = 0; document.activeElement !== handle; step++) {
    if (step === 30) throw new Error(`Can't reach the drag button of "${title}"`);
    if (document.activeElement?.getAttribute("aria-label") === title) act(() => handle.focus());
    else await press("ArrowDown");
  }
  await press("Enter");
  for (let step = 0; step < 30; step++) {
    const focused = document.activeElement;
    const inDestination = focused !== null && destination.contains(focused);
    if (inDestination && focused.getAttribute("aria-label") === target) {
      await press("Enter");
      return;
    }
    await press(inDestination ? "ArrowDown" : "Tab");
  }
  throw new Error(`No drop target "${target}" in ${columnName}`);
}

it("REQ-024.1: the board shows one column per status in order, each with its issue count", async () => {
  mockBoard();
  renderAppAt("/project/WEB");

  await screen.findByRole("region", { name: "Backlog" });
  const names = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
  expect(names).toEqual(["Backlog", "In Progress", "In Review", "Done", "Canceled"]);
  const counts = ["Backlog", "In Progress", "In Review", "Done", "Canceled"].map(
    (name) => column(name).querySelector(".tl-board-col__count")?.textContent,
  );
  expect(counts).toEqual(["3", "2", "0", "0", "0"]);
});

it("REQ-025.1: WEB-42 with 5 labels shows its ID, title, priority, initials, 3 labels and +2", async () => {
  mockBoard();
  renderAppAt("/project/WEB");

  await screen.findByRole("region", { name: "Backlog" });
  const web42Card = cardIn("Backlog", "Fix login button");
  expect(within(web42Card).getByRole("link", { name: "Fix login button" }).getAttribute("href")).toBe(
    "/issue/WEB-42",
  );
  expect(within(web42Card).getByText("WEB-42")).toBeTruthy();
  expect(within(web42Card).getByRole("img", { name: "high" })).toBeTruthy();
  expect(within(web42Card).getByText("SL")).toBeTruthy();
  for (const name of ["backend", "bug", "Design"]) expect(within(web42Card).getByText(name)).toBeTruthy();
  for (const name of ["docs", "frontend"]) expect(within(web42Card).queryByText(name)).toBeNull();
  expect(within(web42Card).getByText("+2")).toBeTruthy();
});

it("REQ-025.2: an unassigned card with No priority shows no initials or priority icon", async () => {
  mockBoard();
  renderAppAt("/project/WEB");

  await screen.findByRole("region", { name: "Backlog" });
  const web12Card = cardIn("Backlog", "Tidy up footer links");
  expect(within(web12Card).queryByRole("img", { name: /urgent|high|medium|med|low|none/ })).toBeNull();
  expect(web12Card.querySelector(".tl-avatar")).toBeNull();
});

it("REQ-029.1: + on In Review creates the issue in In Review and opens it", async () => {
  const fetchMock = mockBoard();
  renderAppAt("/project/WEB");

  fireEvent.click(await screen.findByRole("button", { name: "New issue in In Review" }));
  const dialog = screen.getByRole("dialog", { name: "New issue" });
  expect(dialog.textContent).toContain("It starts in In Review.");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Title" }), {
    target: { value: "Update pricing copy" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  await waitFor(() => expect(window.location.pathname).toBe("/issue/WEB-43"));
  const [body] = requestsTo(fetchMock, "POST /api/projects/WEB/issues") as {
    title: string;
    status: string;
  }[];
  expect(body.title).toBe("Update pricing copy");
  expect(body.status).toBe("in_review");
});

it("REQ-030.1: ⋯ → Move to → In Review puts WEB-42 at the top of In Review", async () => {
  const fetchMock = mockBoard({
    move: () => board({ backlog: [web7, web12], in_progress: [web5, web9], in_review: [web42] }),
  });
  renderAppAt("/project/WEB");

  const submenu = await openMoveTo("WEB-42");
  fireEvent.click(within(submenu).getByRole("menuitem", { name: "In Review" }));

  await waitFor(() => expect(titlesIn("In Review")).toEqual(["Fix login button"]));
  expect(requestsTo(fetchMock, "PUT /api/issues/WEB-42/position")).toEqual([
    { status: "in_review", place: "top" },
  ]);
  expect(titlesIn("Backlog")).not.toContain("Fix login button");
});

it("REQ-030.2: ⋯ → Move to bottom puts WEB-5 last in In Progress", async () => {
  const fetchMock = mockBoard({
    move: () => board({ backlog: [web42, web7, web12], in_progress: [web9, web5] }),
  });
  renderAppAt("/project/WEB");

  const menu = await openCardMenu("WEB-5");
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Move to bottom" }));

  await waitFor(() =>
    expect(titlesIn("In Progress")).toEqual([
      "Show the project key in the browser tab title",
      "Email digest sends twice on Mondays",
    ]),
  );
  expect(requestsTo(fetchMock, "PUT /api/issues/WEB-5/position")).toEqual([
    { status: "in_progress", place: "bottom" },
  ]);
});

it("the ⋯ menu lists every status, checks and disables the current one, and disables Move to top on the first card", async () => {
  mockBoard();
  renderAppAt("/project/WEB");

  const first = await openCardMenu("WEB-42");
  expect(within(first).getByRole("menuitem", { name: "Move to top" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
  expect(within(first).getByRole("menuitem", { name: "Move to bottom" }).hasAttribute("aria-disabled")).toBe(
    false,
  );
  const submenu = await openSubmenu(first);
  const statuses = within(submenu).getAllByRole("menuitem");
  expect(statuses.map((item) => item.textContent?.replace("✓", "").trim())).toEqual([
    "Backlog",
    "In Progress",
    "In Review",
    "Done",
    "Canceled",
  ]);
  expect(statuses[0].getAttribute("aria-disabled")).toBe("true");
  expect(statuses[0].textContent).toContain("✓");
});

it("the ⋯ menu disables Move to bottom on a column's last card", async () => {
  mockBoard();
  renderAppAt("/project/WEB");

  const last = await openCardMenu("WEB-12");
  expect(within(last).getByRole("menuitem", { name: "Move to bottom" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
});

it("REQ-026.2: a failed move from the menu shows Couldn't move WEB-42 and leaves the board as it was", async () => {
  mockBoard({ move: () => networkError() });
  renderAppAt("/project/WEB");

  const submenu = await openMoveTo("WEB-42");
  fireEvent.click(within(submenu).getByRole("menuitem", { name: "Done" }));

  expect(await screen.findByText("Couldn't move WEB-42")).toBeTruthy();
  expect(titlesIn("Backlog")[0]).toBe("Fix login button");
  expect(titlesIn("Done")).toEqual([]);
});

it("REQ-026.1: dragging WEB-42 by keyboard from Backlog to In Progress saves its status and place, and it's still there after a reload", async () => {
  const fetchMock = mockBoard({
    move: () => board({ backlog: [web7, web12], in_progress: [web5, web42, web9] }),
  });
  renderAppAt("/project/WEB");

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert between Email digest sends twice on Mondays and Show the project key in the browser tab title",
  );

  await waitFor(() =>
    expect(requestsTo(fetchMock, "PUT /api/issues/WEB-42/position")).toEqual([
      { status: "in_progress", place: { after: "WEB-5" } },
    ]),
  );
  cleanup();
  renderAppAt("/project/WEB");
  await waitFor(() =>
    expect(titlesIn("In Progress")).toEqual([
      "Email digest sends twice on Mondays",
      "Fix login button",
      "Show the project key in the browser tab title",
    ]),
  );
  expect(titlesIn("Backlog")).not.toContain("Fix login button");
});

it("NFR-005: a dropped card shows in its new place before the save finishes", async () => {
  mockBoard({ move: () => never() });
  renderAppAt("/project/WEB");

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert before Email digest sends twice on Mondays",
  );

  await waitFor(() =>
    expect(titlesIn("In Progress")).toEqual([
      "Fix login button",
      "Email digest sends twice on Mondays",
      "Show the project key in the browser tab title",
    ]),
  );
  expect(titlesIn("Backlog")).toEqual(["Add password rules to the reset form", "Tidy up footer links"]);
  expect(column("In Progress").querySelector(".tl-board-col__count")?.textContent).toBe("3");
  expect(column("Backlog").querySelector(".tl-board-col__count")?.textContent).toBe("2");
});

it("REQ-026.2: a drag whose save fails puts WEB-42 back in Backlog with the toast Couldn't move WEB-42", async () => {
  mockBoard({ move: () => networkError() });
  renderAppAt("/project/WEB");

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert before Email digest sends twice on Mondays",
  );

  expect(await screen.findByText("Couldn't move WEB-42")).toBeTruthy();
  expect(titlesIn("Backlog")).toEqual([
    "Fix login button",
    "Add password rules to the reset form",
    "Tidy up footer links",
  ]);
  expect(titlesIn("In Progress")).not.toContain("Fix login button");
});

it("REQ-026.4: after a move, the columns involved refresh from the server", async () => {
  const fetchMock = mockBoard({
    move: () => board({ backlog: [web12], in_progress: [web5, web9], in_review: [web42], done: [web7] }),
  });
  renderAppAt("/project/WEB");

  await dragByKeyboard("Fix login button", "In Review", "Drop on");

  await waitFor(() => expect(titlesIn("Done")).toEqual(["Add password rules to the reset form"]));
  expect(titlesIn("In Review")).toEqual(["Fix login button"]);
  expect(titlesIn("Backlog")).toEqual(["Tidy up footer links"]);
  expect(requestsTo(fetchMock, "GET /api/projects/WEB/board")).toHaveLength(2);
});

it("REQ-026.5: dragging an issue another member deleted shows This issue was deleted and removes the card", async () => {
  let deleted = false;
  mockBoard({
    getBoard: () =>
      Response.json(deleted ? board({ backlog: [web7, web12], in_progress: [web5, web9] }) : webBoard),
    move: () => {
      deleted = true;
      return apiError(404, "This issue was deleted");
    },
  });
  renderAppAt("/project/WEB");

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert before Email digest sends twice on Mondays",
  );

  expect(await screen.findByText("This issue was deleted")).toBeTruthy();
  await waitFor(() =>
    expect(titlesIn("Backlog")).toEqual(["Add password rules to the reset form", "Tidy up footer links"]),
  );
  expect(titlesIn("In Progress")).not.toContain("Fix login button");
});

it("dropping a card between two cards in its own column saves place { after: <card above> }, and dropping it first saves top", async () => {
  const fetchMock = mockBoard();
  renderAppAt("/project/WEB");

  await dragByKeyboard(
    "Tidy up footer links",
    "Backlog",
    "Insert between Fix login button and Add password rules to the reset form",
  );
  await waitFor(() =>
    expect(requestsTo(fetchMock, "PUT /api/issues/WEB-12/position")).toEqual([
      { status: "backlog", place: { after: "WEB-42" } },
    ]),
  );

  await dragByKeyboard("Add password rules to the reset form", "Backlog", "Insert before Fix login button");
  await waitFor(() =>
    expect(requestsTo(fetchMock, "PUT /api/issues/WEB-7/position")).toEqual([
      { status: "backlog", place: "top" },
    ]),
  );
});

it("dropping a card into an empty column saves place top", async () => {
  const fetchMock = mockBoard();
  renderAppAt("/project/WEB");

  await dragByKeyboard("Email digest sends twice on Mondays", "Canceled", "Drop on");

  await waitFor(() =>
    expect(requestsTo(fetchMock, "PUT /api/issues/WEB-5/position")).toEqual([
      { status: "canceled", place: "top" },
    ]),
  );
});

it("STD-7: empty columns name the next action, and Create one opens New issue in that column's status", async () => {
  mockBoard({ columns: board({}) });
  renderAppAt("/project/WEB");

  await screen.findByRole("region", { name: "Backlog" });
  for (const name of ["Backlog", "In Progress", "In Review"]) {
    expect(column(name).textContent).toContain("No issues yet. Create one.");
  }
  for (const name of ["Done", "Canceled"]) {
    expect(column(name).textContent).toContain("Nothing moved here in the last 14 days.");
  }

  fireEvent.click(within(column("In Progress")).getByRole("button", { name: "Create one." }));
  expect(screen.getByRole("dialog", { name: "New issue" }).textContent).toContain(
    "It starts in In Progress.",
  );
});

it("REQ-024.2: an archived project's board has no + buttons, ⋯ menus or drag buttons, and cards still open", async () => {
  mockBoard({ shown: archivedWeb });
  renderAppAt("/project/WEB");

  await screen.findByRole("region", { name: "Backlog" });
  expect(screen.queryByRole("button", { name: /^New issue in/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /actions$/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Drag / })).toBeNull();
  expect(column("In Review").textContent).toContain("No issues.");
  expect(column("In Review").textContent).not.toContain("Create one.");
  expect(
    within(cardIn("Backlog", "Fix login button"))
      .getByRole("link", { name: "Fix login button" })
      .getAttribute("href"),
  ).toBe("/issue/WEB-42");
});

it("STD-7: a board that fails to load shows Couldn't load this. with Retry", async () => {
  let fail = true;
  mockBoard({
    getBoard: () => (fail ? apiError(500, "Server error") : Response.json(webBoard)),
  });
  renderAppAt("/project/WEB");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("region", { name: "Backlog" })).toBeTruthy();
});