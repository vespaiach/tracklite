import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { startTransition, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  ActionResult,
  Board as BoardColumns,
  BoardIssue,
  BoardMove,
  IssueLabel,
  IssueStatus,
  MemberSummary,
  ProjectSummary,
} from "../../../../contract";
import { loadPage } from "../../../../lib/load-page";
import { renderForm } from "../../../../test/forms";
import { Board } from "./Board";
import type { CreateIssue } from "./NewIssueDialog";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../../../../lib/load-page", () => ({ loadPage: vi.fn() }));

afterEach(async () => {
  await act(async () => {
    for (const settle of unsettledMoves.splice(0)) settle({ ok: true, data: null });
  });
  cleanup();
  clearElementSizes();
  vi.mocked(loadPage).mockClear();
  router.refresh.mockClear();
});

const sam: MemberSummary = { username: "sam", fullName: "Sam Lee", initials: "SL", deactivated: false };
const alex: MemberSummary = { username: "alex", fullName: "Alex Kim", initials: "AK", deactivated: false };

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
const archivedWeb: ProjectSummary = { ...web, archivedAt: "2026-09-30T10:00:00.000Z" };

function labels(...names: string[]): IssueLabel[] {
  return names.map((name) => ({ id: `l-${name.toLowerCase()}`, name, color: "gray" }));
}

function card(id: string, title: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return { id, title, priority: "medium", assignees: [alex], labels: [], ...overrides };
}

const web42 = card("WEB-42", "Fix login button", {
  priority: "high",
  assignees: [sam],
  labels: labels("backend", "bug", "Design", "docs", "frontend"),
});
const web7 = card("WEB-7", "Add password rules to the reset form", { labels: labels("frontend") });
const web12 = card("WEB-12", "Tidy up footer links", { priority: "none", assignees: [] });
const web5 = card("WEB-5", "Email digest sends twice on Mondays", { priority: "urgent" });
const web9 = card("WEB-9", "Show the project key in the browser tab title");

function board(columns: Partial<Record<IssueStatus, BoardIssue[]>>): BoardColumns {
  const order: IssueStatus[] = ["backlog", "in_progress", "in_review", "done", "canceled"];
  return order.map((status) => {
    const cards = columns[status] ?? [];
    return { status, count: cards.length, cards };
  });
}

const webBoard = board({ backlog: [web42, web7, web12], in_progress: [web5, web9] });

function longBacklog(size: number) {
  const fillers = Array.from({ length: size - 3 }, (_, index) =>
    card(`WEB-${100 + index}`, `Filler ${index}`),
  );
  return board({ backlog: [web42, web7, web12, ...fillers] });
}

const elementSizes = { clientWidth: 268, clientHeight: 600, scrollWidth: 254, scrollHeight: 80 };

function mockElementSizes() {
  for (const [name, size] of Object.entries(elementSizes)) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => size });
  }
}

function clearElementSizes() {
  for (const name of Object.keys(elementSizes)) {
    Reflect.deleteProperty(HTMLElement.prototype, name);
  }
}

type MoveAnswer = BoardColumns | ActionResult<null> | Promise<ActionResult<null>>;

const unsettledMoves: ((result: ActionResult<null>) => void)[] = [];

function unsettled() {
  return new Promise<ActionResult<null>>((settle) => unsettledMoves.push(settle));
}

function refused(kind: "notFound" | "forbidden", message: string): ActionResult<null> {
  return { ok: false, error: { kind, message } };
}

function failedCall(): Promise<ActionResult<null>> {
  return Promise.reject(new TypeError("Failed to fetch"));
}

function renderBoard({
  shown = web,
  columns = webBoard,
  move = (_move: BoardMove): MoveAnswer => columns,
  createIssue = vi.fn<CreateIssue>(async () => ({ ok: true, data: { id: "WEB-43" } })),
}: {
  shown?: ProjectSummary;
  columns?: BoardColumns;
  move?: (move: BoardMove) => MoveAnswer;
  createIssue?: CreateIssue;
} = {}) {
  const moveIssue = vi.fn<(move: BoardMove) => Promise<ActionResult<null>>>();

  function RefreshingBoard() {
    const [current, setCurrent] = useState(columns);
    moveIssue.mockImplementation(async (issueMove) => {
      const answer = await move(issueMove);
      if (!Array.isArray(answer)) return answer;
      startTransition(() => setCurrent(answer));
      return { ok: true, data: null };
    });
    return (
      <Board
        project={shown}
        columns={current}
        members={[sam, alex]}
        me="sam"
        createIssue={createIssue}
        moveIssue={moveIssue}
      />
    );
  }

  renderForm(<RefreshingBoard />);
  return moveIssue;
}

function movesOf(moveIssue: ReturnType<typeof renderBoard>, id: string) {
  return moveIssue.mock.calls
    .filter(([move]) => move.id === id)
    .map(([{ status, place }]) => ({ status, place }));
}

function column(name: string) {
  return screen.getByRole("region", { name });
}

function cardIn(columnName: string, title: string) {
  return within(column(columnName)).getByRole("article", { name: (name) => name.startsWith(`${title}, `) });
}

function titlesIn(columnName: string) {
  return within(column(columnName))
    .queryAllByRole("article")
    .map((article) => within(article).getByRole("link").textContent);
}

async function openCardMenu(id: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Actions for ${id}` }));
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

const dropFocusWindowMs = 50;

async function settleDrop() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, dropFocusWindowMs));
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
      await settleDrop();
      return;
    }
    await press(inDestination ? "ArrowDown" : "Tab");
  }
  throw new Error(`No drop target "${target}" in ${columnName}`);
}

it("REQ-024.1, REQ-025.1, REQ-025.2: columns in order with counts; a card shows ID, title, priority, initials (accent for yourself), 3 labels and +2 titled with the rest; an unassigned card with No priority shows neither", async () => {
  renderBoard();

  await screen.findByRole("region", { name: "Backlog" });
  const names = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
  expect(names).toEqual(["Backlog", "In Progress", "In Review", "Done", "Canceled"]);
  const counts = ["Backlog", "In Progress", "In Review", "Done", "Canceled"].map(
    (name) => column(name).querySelector(".tl-board-col__count")?.textContent,
  );
  expect(counts).toEqual(["3", "2", "0", "0", "0"]);

  const web42Card = cardIn("Backlog", "Fix login button");
  expect(within(web42Card).getByRole("link", { name: "Fix login button" }).getAttribute("href")).toBe(
    "/issue/WEB-42",
  );
  expect(within(web42Card).getByText("WEB-42")).toBeTruthy();
  expect(within(web42Card).getByRole("img", { name: "high" })).toBeTruthy();
  expect(within(web42Card).getByText("SL").className).toBe("tl-avatar tl-avatar--md tl-avatar--accent");
  expect(within(cardIn("Backlog", "Add password rules to the reset form")).getByText("AK").className).toBe(
    "tl-avatar tl-avatar--md tl-avatar--neutral",
  );
  for (const name of ["backend", "bug", "Design"]) expect(within(web42Card).getByText(name)).toBeTruthy();
  for (const name of ["docs", "frontend"]) expect(within(web42Card).queryByText(name)).toBeNull();
  expect(within(web42Card).getByText("+2").getAttribute("title")).toBe("docs, frontend");

  const web12Card = cardIn("Backlog", "Tidy up footer links");
  expect(within(web12Card).queryByRole("img", { name: /urgent|high|medium|med|low|none/ })).toBeNull();
  expect(web12Card.querySelector(".tl-avatar")).toBeNull();
});

const fiveAssignees = [
  alex,
  { username: "jo", fullName: "Jo Park", initials: "JP", deactivated: true },
  { username: "max", fullName: "Max Ito", initials: "MI", deactivated: false },
  { username: "nina", fullName: "Nina Shah", initials: "NS", deactivated: false },
  sam,
];

it("REQ-025.3, REQ-025.2: a card with 5 assignees shows 3 avatars and +2 and its name reads every assignee; an unassigned card's name says so", async () => {
  const web33 = card("WEB-33", "Rework the sign-up flow", { assignees: fiveAssignees });
  renderBoard({ columns: board({ backlog: [web33, web12] }) });

  const web33Card = await screen.findByRole("article", {
    name: "Rework the sign-up flow, assigned to Alex Kim, Jo Park (deactivated), Max Ito, Nina Shah, Sam Lee",
  });
  const avatars = [...web33Card.querySelectorAll(".tl-avatar")].map((avatar) => avatar.textContent);
  expect(avatars).toEqual(["AK", "JP", "MI"]);
  expect(within(web33Card).getByText("+2")).toBeTruthy();
  expect(screen.getByRole("article", { name: "Tidy up footer links, unassigned" })).toBeTruthy();
});

it("REQ-029.1: + on In Review creates the issue in In Review and opens it", async () => {
  const createIssue = vi.fn<CreateIssue>(async () => ({ ok: true, data: { id: "WEB-43" } }));
  renderBoard({ createIssue });

  fireEvent.click(await screen.findByRole("button", { name: "New issue in In Review" }));
  const dialog = screen.getByRole("dialog", { name: "New issue" });
  expect(dialog.textContent).toContain("It starts in In Review.");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Title" }), {
    target: { value: "Update pricing copy" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  await waitFor(() => expect(loadPage).toHaveBeenCalledWith("/issue/WEB-43"));
  expect(createIssue).toHaveBeenCalledWith(
    expect.objectContaining({ key: "WEB", title: "Update pricing copy", status: "in_review" }),
  );
});

it("REQ-030.1: ⋯ → Move to → In Review puts WEB-42 at the top of In Review", async () => {
  const moveIssue = renderBoard({
    move: () => board({ backlog: [web7, web12], in_progress: [web5, web9], in_review: [web42] }),
  });

  const submenu = await openMoveTo("WEB-42");
  fireEvent.click(within(submenu).getByRole("menuitem", { name: "In Review" }));

  await waitFor(() => expect(titlesIn("In Review")).toEqual(["Fix login button"]));
  expect(movesOf(moveIssue, "WEB-42")).toEqual([{ status: "in_review", place: "top" }]);
  expect(titlesIn("Backlog")).not.toContain("Fix login button");
});

it("REQ-030.2: ⋯ → Move to bottom puts WEB-5 last in In Progress", async () => {
  const moveIssue = renderBoard({
    move: () => board({ backlog: [web42, web7, web12], in_progress: [web9, web5] }),
  });

  const menu = await openCardMenu("WEB-5");
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Move to bottom" }));

  await waitFor(() =>
    expect(titlesIn("In Progress")).toEqual([
      "Show the project key in the browser tab title",
      "Email digest sends twice on Mondays",
    ]),
  );
  expect(movesOf(moveIssue, "WEB-5")).toEqual([{ status: "in_progress", place: "bottom" }]);
});

it("the ⋯ menu lists every status, checks and disables the current one, disables Move to top on the first card and Move to bottom on the last", async () => {
  renderBoard();

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

  fireEvent.keyDown(submenu, { key: "Escape" });
  fireEvent.keyDown(first, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  const last = await openCardMenu("WEB-12");
  expect(within(last).getByRole("menuitem", { name: "Move to bottom" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
});

it("REQ-026.1: dragging WEB-42 by keyboard from Backlog to In Progress saves its status and place, and the board then shows the saved columns", async () => {
  const moveIssue = renderBoard({
    move: () => board({ backlog: [web7, web12], in_progress: [web5, web42, web9] }),
  });

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert between Email digest sends twice on Mondays and Show the project key in the browser tab title",
  );

  await waitFor(() =>
    expect(movesOf(moveIssue, "WEB-42")).toEqual([{ status: "in_progress", place: { after: "WEB-5" } }]),
  );
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
  renderBoard({ move: unsettled });

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

it("NFR-005: a 300-card column renders only the cards in view", async () => {
  mockElementSizes();
  renderBoard({ columns: longBacklog(300) });

  await screen.findByRole("region", { name: "Backlog" });
  await waitFor(() =>
    expect(titlesIn("Backlog").slice(0, 3)).toEqual([
      "Fix login button",
      "Add password rules to the reset form",
      "Tidy up footer links",
    ]),
  );
  expect(titlesIn("Backlog").length).toBeLessThan(30);
  expect(column("Backlog").querySelector(".tl-board-col__count")?.textContent).toBe("300");
});

it("NFR-005: moving a card in a 300-card column shows it in its new place before the save finishes", async () => {
  mockElementSizes();
  const moveIssue = renderBoard({ columns: longBacklog(300), move: unsettled });

  await dragByKeyboard("Fix login button", "Backlog", "Insert between Tidy up footer links and Filler 0");

  await waitFor(() =>
    expect(titlesIn("Backlog").slice(0, 4)).toEqual([
      "Add password rules to the reset form",
      "Tidy up footer links",
      "Fix login button",
      "Filler 0",
    ]),
  );
  expect(movesOf(moveIssue, "WEB-42")).toEqual([{ status: "backlog", place: { after: "WEB-12" } }]);
  expect(titlesIn("Backlog").length).toBeLessThan(30);
});

it("REQ-026.2: a drag whose save fails puts WEB-42 back in Backlog with the toast Couldn’t move WEB-42", async () => {
  renderBoard({ move: failedCall });

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert before Email digest sends twice on Mondays",
  );

  expect(await screen.findByText("Couldn’t move WEB-42")).toBeTruthy();
  await waitFor(() =>
    expect(titlesIn("Backlog")).toEqual([
      "Fix login button",
      "Add password rules to the reset form",
      "Tidy up footer links",
    ]),
  );
  expect(titlesIn("In Progress")).not.toContain("Fix login button");
});

it("REQ-026.4: after a move, the columns involved refresh from the server", async () => {
  const moveIssue = renderBoard({
    move: () => board({ backlog: [web12], in_progress: [web5, web9], in_review: [web42], done: [web7] }),
  });

  await dragByKeyboard("Fix login button", "In Review", "Drop on");

  await waitFor(() => expect(titlesIn("Done")).toEqual(["Add password rules to the reset form"]));
  expect(titlesIn("In Review")).toEqual(["Fix login button"]);
  expect(titlesIn("Backlog")).toEqual(["Tidy up footer links"]);
  expect(movesOf(moveIssue, "WEB-42")).toEqual([{ status: "in_review", place: "top" }]);
});

it("REQ-026.5: dragging an issue another member deleted shows This issue was deleted and refreshes the board, which drops the card", async () => {
  renderBoard({ move: () => refused("notFound", "This issue was deleted") });

  await dragByKeyboard(
    "Fix login button",
    "In Progress",
    "Insert before Email digest sends twice on Mondays",
  );

  expect(await screen.findByText("This issue was deleted")).toBeTruthy();
  expect(router.refresh).toHaveBeenCalledOnce();
  await waitFor(() => expect(titlesIn("In Progress")).not.toContain("Fix login button"));
});

it("STD-9: a move refused for another reason toasts the server's message and doesn't refresh", async () => {
  renderBoard({ move: () => refused("forbidden", "This project is archived") });

  await dragByKeyboard("Fix login button", "In Review", "Drop on");

  expect(await screen.findByText("This project is archived")).toBeTruthy();
  await waitFor(() => expect(titlesIn("In Review")).toEqual([]));
  expect(router.refresh).not.toHaveBeenCalled();
});

it("dropping a card between two cards in its own column saves place { after: <card above> }, dropping it first saves top, and dropping into an empty column saves top", async () => {
  const moveIssue = renderBoard();

  await dragByKeyboard(
    "Tidy up footer links",
    "Backlog",
    "Insert between Fix login button and Add password rules to the reset form",
  );
  await waitFor(() =>
    expect(movesOf(moveIssue, "WEB-12")).toEqual([{ status: "backlog", place: { after: "WEB-42" } }]),
  );

  await dragByKeyboard("Add password rules to the reset form", "Backlog", "Insert before Fix login button");
  await waitFor(() => expect(movesOf(moveIssue, "WEB-7")).toEqual([{ status: "backlog", place: "top" }]));

  await dragByKeyboard("Email digest sends twice on Mondays", "Canceled", "Drop on");
  await waitFor(() => expect(movesOf(moveIssue, "WEB-5")).toEqual([{ status: "canceled", place: "top" }]));
});

it("STD-7: empty columns name the next action, and Create one opens New issue in that column's status", async () => {
  renderBoard({ columns: board({}) });

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

it("Done and Canceled have no + button, and their cards are drawn closed", async () => {
  renderBoard({ columns: board({ backlog: [web7], done: [web42], canceled: [web5] }) });

  await screen.findByRole("region", { name: "Backlog" });
  const addButtons = screen.getAllByRole("button", { name: /^New issue in/ });
  expect(addButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
    "New issue in Backlog",
    "New issue in In Progress",
    "New issue in In Review",
  ]);
  expect(cardIn("Done", "Fix login button").className).toContain("tl-board-card--closed");
  expect(cardIn("Canceled", "Email digest sends twice on Mondays").className).toContain(
    "tl-board-card--closed",
  );
  expect(cardIn("Backlog", "Add password rules to the reset form").className).not.toContain(
    "tl-board-card--closed",
  );
});

it("REQ-024.2: an archived project's board has no + buttons, ⋯ menus or drag buttons, every empty column says No issues., and cards still open", async () => {
  renderBoard({ shown: archivedWeb });

  await screen.findByRole("region", { name: "Backlog" });
  expect(screen.queryByRole("button", { name: /^New issue in/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Actions for/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Drag / })).toBeNull();
  for (const name of ["In Review", "Done", "Canceled"]) {
    expect(column(name).querySelector(".tl-board-empty")?.textContent).toBe("No issues.");
  }
  expect(
    within(cardIn("Backlog", "Fix login button"))
      .getByRole("link", { name: "Fix login button" })
      .getAttribute("href"),
  ).toBe("/issue/WEB-42");
});