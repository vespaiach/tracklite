import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  apiError,
  mockApi,
  never,
  project,
  renderAppAt,
  requestsTo,
  sam,
  summary,
} from "../../test/client-app";
import type { Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const saved = "### This quarter\n\n- Ship the new pricing page\n- Fix the login button";

const web: Project = { ...project("WEB", "Website"), description: saved, descriptionVersion: 3 };

function mockDetail({ shown = web, patch }: { shown?: Project; patch?: Answer } = {}) {
  let current = shown;
  return mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/projects?archived=false": () =>
      Response.json(current.archivedAt === null ? [summary(current)] : []),
    [`GET /api/projects/${shown.key}`]: () => Response.json(current),
    [`PATCH /api/projects/${shown.key}`]:
      patch ??
      ((body) => {
        const change = body as { description: string };
        current = {
          ...current,
          description: change.description,
          descriptionVersion: current.descriptionVersion + 1,
        };
        return Response.json(current);
      }),
  });
}

async function startEditing() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  return screen.getByLabelText("Description (Markdown)") as HTMLTextAreaElement;
}

async function editTo(text: string) {
  const editor = await startEditing();
  fireEvent.change(editor, { target: { value: text } });
  return editor;
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

function editor() {
  return screen.getByLabelText("Description (Markdown)") as HTMLTextAreaElement;
}

it("REQ-046.1: the details page shows the project's description formatted", async () => {
  mockDetail();
  renderAppAt("/project/WEB/detail");

  expect(await screen.findByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.getByText("Ship the new pricing page").tagName).toBe("LI");
  expect(screen.getByRole("link", { name: "Details" }).getAttribute("aria-current")).toBe("page");
});

it("REQ-012.1: saving a description sends it with its version and shows it formatted", async () => {
  const fetchMock = mockDetail();
  renderAppAt("/project/WEB/detail");

  await editTo("## Goals\n\n- Launch pricing\n- Fix Safari");
  save();

  expect(await screen.findByRole("heading", { level: 2, name: "Goals" })).toBeTruthy();
  expect(screen.getByText("Launch pricing").tagName).toBe("LI");
  expect(screen.queryByLabelText("Description (Markdown)")).toBeNull();
  expect(requestsTo(fetchMock, "PATCH /api/projects/WEB")).toEqual([
    { description: "## Goals\n\n- Launch pricing\n- Fix Safari", descriptionVersion: 3 },
  ]);
});

it("STD-5: Save is disabled while the description saves", async () => {
  mockDetail({ patch: never });
  renderAppAt("/project/WEB/detail");

  await editTo("New text");
  save();

  const saving = (await screen.findByRole("button", { name: "Saving…" })) as HTMLButtonElement;
  expect(saving.disabled).toBe(true);
});

it("REQ-012.2: a too-long description shows the field error and keeps the text", async () => {
  mockDetail({
    patch: () => apiError(422, "Check the highlighted fields", { description: "Too long (max 20,000)" }),
  });
  renderAppAt("/project/WEB/detail");
  const long = "a".repeat(20_001);

  await editTo(long);
  save();

  expect(await screen.findByText("Too long (max 20,000)")).toBeTruthy();
  expect(editor().value).toBe(long);
  expect(editor().getAttribute("aria-invalid")).toBe("true");
});

it("STD-8: a conflicting save shows the server message in the editor and keeps the text", async () => {
  mockDetail({ patch: () => apiError(409, "This was changed by Alex Kim. Copy your text and reload.") });
  renderAppAt("/project/WEB/detail");

  await editTo("My version");
  save();

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("This was changed by Alex Kim. Copy your text and reload.");
  expect(alert.closest(".tl-editor")).toBeTruthy();
  expect(editor().value).toBe("My version");
  expect(screen.queryByText("Couldn't save. Try again.")).toBeNull();
});

it("STD-9: a failed save shows a toast and keeps the editor open", async () => {
  mockDetail({ patch: () => apiError(500, "Internal error") });
  renderAppAt("/project/WEB/detail");

  await editTo("My version");
  save();

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect(editor().value).toBe("My version");
});

it("Cancel discards the draft and shows the saved description", async () => {
  const fetchMock = mockDetail();
  renderAppAt("/project/WEB/detail");

  await editTo("Thrown away");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(await screen.findByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.queryByLabelText("Description (Markdown)")).toBeNull();
  expect(requestsTo(fetchMock, "PATCH /api/projects/WEB")).toEqual([]);
});

it("REQ-035.3: leaving with unsaved description changes asks first", async () => {
  mockDetail();
  renderAppAt("/project/WEB/detail");
  await editTo("Unsaved text");

  fireEvent.click(within(await screen.findByRole("complementary")).getByRole("link", { name: "My issues" }));
  const prompt = await screen.findByRole("alertdialog", { name: "You have unsaved changes. Leave anyway?" });
  fireEvent.click(within(prompt).getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(window.location.pathname).toBe("/project/WEB/detail");
  expect(editor().value).toBe("Unsaved text");

  fireEvent.click(within(screen.getByRole("complementary")).getByRole("link", { name: "My issues" }));
  const again = await screen.findByRole("alertdialog", { name: "You have unsaved changes. Leave anyway?" });
  fireEvent.click(within(again).getByRole("button", { name: "Leave" }));

  await waitFor(() => expect(window.location.pathname).toBe("/my-issues"));
});

it("REQ-035: leaving with an unchanged editor doesn't ask", async () => {
  mockDetail();
  renderAppAt("/project/WEB/detail");
  await startEditing();

  fireEvent.click(within(await screen.findByRole("complementary")).getByRole("link", { name: "My issues" }));

  await waitFor(() => expect(window.location.pathname).toBe("/my-issues"));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("REQ-035.4: closing the tab with unsaved description changes asks the browser to confirm", async () => {
  mockDetail();
  renderAppAt("/project/WEB/detail");
  await startEditing();

  const unchanged = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unchanged);
  expect(unchanged.defaultPrevented).toBe(false);

  fireEvent.change(editor(), { target: { value: "Unsaved text" } });
  const changed = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(changed);
  expect(changed.defaultPrevented).toBe(true);
});

it("REQ-012.3: HTML in a description is shown as text", async () => {
  mockDetail({ shown: { ...web, description: "Embed test: <script>alert(1)</script>" } });
  renderAppAt("/project/WEB/detail");

  expect(await screen.findByText("Embed test: <script>alert(1)</script>")).toBeTruthy();
  expect(document.querySelector("main script, .tl-prose script")).toBeNull();
});

it("REQ-013: an archived project's description has no Edit button", async () => {
  mockDetail({ shown: { ...web, archivedAt: "2025-09-14T10:00:00.000Z" } });
  renderAppAt("/project/WEB/detail");

  expect(await screen.findByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

it("STD-7: an empty description names the next action", async () => {
  mockDetail({ shown: { ...web, description: "" } });
  renderAppAt("/project/WEB/detail");

  expect(await screen.findByText("No description yet. Select Edit to add one.")).toBeTruthy();
});