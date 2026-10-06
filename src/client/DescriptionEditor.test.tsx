import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { alex, issue, mockApi, project, renderAppAt, requestsTo, sam } from "../test/client-app";
import type { Me } from "./api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const jordan: Me = { ...alex, username: "jordan", fullName: "Jordan Diaz", initials: "JD" };
const priya: Me = { ...alex, username: "priya", fullName: "Priya Shah", initials: "PS", deactivated: true };

function mockIssuePage() {
  return mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json([alex, jordan, priya, sam]),
    "GET /api/projects/WEB": () => Response.json(project("WEB", "Website")),
    "GET /api/projects/WEB/labels": () => Response.json([]),
    "GET /api/issues/WEB-42": () => Response.json(issue()),
  });
}

async function openEditor() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit description" }));
  return (await screen.findByRole("textbox", { name: "Description (Markdown)" })) as HTMLTextAreaElement;
}

function type(editor: HTMLTextAreaElement, value: string) {
  fireEvent.change(editor, { target: { value } });
  editor.setSelectionRange(value.length, value.length);
  fireEvent.select(editor);
}

function suggestions() {
  return screen.queryByRole("listbox", { name: "Mention a member" });
}

function suggestedUsernames() {
  const list = suggestions();
  if (!list) return [];
  return within(list)
    .queryAllByRole("option")
    .map((option) => option.getAttribute("data-key"));
}

it("DATA-001: typing @ suggests active members only", async () => {
  mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  type(editor, "Pairing with @");

  expect(await screen.findByRole("listbox", { name: "Mention a member" })).toBeTruthy();
  expect(suggestedUsernames()).toEqual(["alex", "jordan", "sam"]);
});

it("DATA-001: typing after @ filters the suggestions by username or name", async () => {
  mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  type(editor, "Pairing with @al");
  expect(suggestedUsernames()).toEqual(["alex"]);

  type(editor, "Pairing with @lee");
  expect(suggestedUsernames()).toEqual(["sam"]);
});

it("DATA-001: Enter or a click on a suggestion inserts @username and keeps focus in the editor", async () => {
  const fetchMock = mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  editor.focus();
  type(editor, "Pairing with @al");
  fireEvent.keyDown(editor, { key: "Enter" });

  expect(editor.value).toBe("Pairing with @alex ");
  expect(suggestions()).toBeNull();
  expect(document.activeElement).toBe(editor);

  type(editor, "Pairing with @alex and @sa");
  const sam = within(suggestions() as HTMLElement).getByRole("option", { name: /Sam Lee/ });
  fireEvent.mouseDown(sam);
  fireEvent.click(sam);

  expect(editor.value).toBe("Pairing with @alex and @sam ");
  expect(document.activeElement).toBe(editor);
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([]);
});

it("DATA-001: the arrow keys move the highlighted suggestion", async () => {
  mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  type(editor, "@");
  const options = within(suggestions() as HTMLElement).getAllByRole("option");
  expect(editor.getAttribute("aria-activedescendant")).toBe(options[0].id);

  fireEvent.keyDown(editor, { key: "ArrowDown" });
  expect(editor.getAttribute("aria-activedescendant")).toBe(options[1].id);
  expect(options[1].getAttribute("aria-selected")).toBe("true");

  fireEvent.keyDown(editor, { key: "ArrowUp" });
  expect(editor.getAttribute("aria-activedescendant")).toBe(options[0].id);
});

it("DATA-001: a query that matches no one shows No results", async () => {
  mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  type(editor, "Pairing with @zz");

  expect(within(suggestions() as HTMLElement).getByRole("status").textContent).toBe("No results for “@zz”");
});

it("DATA-001: Escape closes the suggestions before it cancels the edit", async () => {
  mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  type(editor, "Pairing with @al");
  fireEvent.keyDown(editor, { key: "Escape" });

  expect(suggestions()).toBeNull();
  expect(screen.getByRole("textbox", { name: "Description (Markdown)" })).toBe(editor);

  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull();
});

it("DATA-001.5: an @ inside a word doesn't open the suggestions", async () => {
  mockIssuePage();
  renderAppAt("/issue/WEB-42");

  const editor = await openEditor();
  type(editor, "Write to foo@sa");

  expect(suggestions()).toBeNull();
});