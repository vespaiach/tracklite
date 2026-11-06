import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, startTransition, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Link } from "../../../../../components/leave-guard";
import { ToastProvider } from "../../../../../components/toast";
import type { ActionResult, MemberSummary, Project } from "../../../../../contract";
import { refused } from "../../../../../test/forms";
import { ProjectDetail, type SaveDescription } from "./ProjectDetail";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    children,
  }: {
    href: string;
    onNavigate: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate({ preventDefault: () => {} });
      }}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  router.refresh.mockReset();
});

const saved = "### This quarter\n\n- Ship the new pricing page\n- Fix the login button";

const alex: MemberSummary = { username: "alex", fullName: "Alex Kim", initials: "AK", deactivated: false };

const web: Project = {
  key: "WEB",
  name: "Website",
  description: saved,
  descriptionVersion: 3,
  mentions: [],
  archivedAt: null,
  issueCounts: { backlog: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
  createdAt: "2026-09-20T10:42:00.000Z",
  createdBy: null,
};

const archived = "2025-09-14T10:00:00.000Z";

type Answer = (save: Parameters<SaveDescription>[0]) => ActionResult<null> | Promise<ActionResult<null>>;

function renderDetail({ shown = web, answer }: { shown?: Project; answer?: Answer } = {}) {
  let onServer = shown;
  const saveDescription = vi.fn<SaveDescription>();

  function RefreshingDetail() {
    const [current, setCurrent] = useState(shown);
    const refresh = () => startTransition(() => setCurrent(onServer));
    router.refresh.mockImplementation(refresh);
    saveDescription.mockImplementation(async (save) => {
      const result = await (answer ?? (() => ({ ok: true, data: null }) as const))(save);
      if (result.ok) {
        onServer = {
          ...onServer,
          description: save.description,
          descriptionVersion: onServer.descriptionVersion + 1,
        };
        refresh();
      }
      return result;
    });
    return (
      <>
        <ProjectDetail
          project={current}
          members={[alex]}
          saveDescription={saveDescription}
        />
        <Link href="/my-issues">My issues</Link>
      </>
    );
  }

  render(
    <ToastProvider>
      <RefreshingDetail />
    </ToastProvider>,
  );
  return {
    saveDescription,
    changeOnServer(project: Project) {
      onServer = project;
    },
  };
}

async function startEditing() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit project description" }));
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

it("REQ-046.1: the details page shows the project's description formatted", () => {
  renderDetail();

  expect(screen.getByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.getByText("Ship the new pricing page").tagName).toBe("LI");
});

it("REQ-012.1, STD-5: saving a description disables Save, sends it with its version and shows it formatted", async () => {
  let answer: (result: ActionResult<null>) => void = () => {};
  const { saveDescription } = renderDetail({
    answer: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const text = "## Goals\n\n- Launch pricing\n- Fix Safari";

  await editTo(text);
  save();

  const saving = (await screen.findByRole("button", { name: "Saving…" })) as HTMLButtonElement;
  expect(saving.disabled).toBe(true);

  answer({ ok: true, data: null });

  expect(await screen.findByRole("heading", { level: 2, name: "Goals" })).toBeTruthy();
  expect(screen.getByText("Launch pricing").tagName).toBe("LI");
  expect(screen.queryByLabelText("Description (Markdown)")).toBeNull();
  expect(saveDescription.mock.calls).toEqual([[{ key: "WEB", description: text, descriptionVersion: 3 }]]);
});

it("REQ-012.2, REQ-022.2, STD-8, STD-9: a refused save shows the field error, a toast, or the conflict in the editor with Save disabled, and always keeps the text; Reload starts from the saved text", async () => {
  const answers: (ActionResult<null> | Error)[] = [
    refused("invalid", "Check the highlighted fields", { description: "Too long (max 20,000)" }),
    new Error("Failed to fetch"),
    refused("forbidden", "This project is archived"),
    refused("conflict", "This was changed by Alex Kim. Copy your text and reload."),
  ];
  const { changeOnServer } = renderDetail({
    answer: async () => {
      const next = answers.shift() as ActionResult<null> | Error;
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const long = "a".repeat(20_001);

  await editTo(long);
  save();

  expect(await screen.findByText("Too long (max 20,000)")).toBeTruthy();
  expect(editor().value).toBe(long);
  expect(editor().getAttribute("aria-invalid")).toBe("true");

  fireEvent.change(editor(), { target: { value: "My version" } });
  save();
  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(editor().value).toBe("My version");

  save();
  expect(await screen.findByText("This project is archived")).toBeTruthy();
  expect(editor().value).toBe("My version");

  save();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("This was changed by Alex Kim. Copy your text and reload.");
  expect(alert.closest(".tl-editor")).toBeTruthy();
  expect(editor().value).toBe("My version");
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);

  changeOnServer({ ...web, description: "Alex's text", descriptionVersion: 4 });
  fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));

  expect(router.refresh).toHaveBeenCalledOnce();
  await waitFor(() => expect(editor().value).toBe("Alex's text"));
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
});

it("REQ-022: Cancel or Escape discards the description draft", async () => {
  const { saveDescription } = renderDetail();

  await editTo("Thrown away");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(await screen.findByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.queryByLabelText("Description (Markdown)")).toBeNull();

  fireEvent.keyDown(await editTo("Thrown away"), { key: "Escape" });

  expect(await screen.findByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.queryByLabelText("Description (Markdown)")).toBeNull();
  expect(saveDescription).not.toHaveBeenCalled();
});

it("REQ-035.3, REQ-035.4, REQ-035: leaving or closing the tab with unsaved description changes asks first; an unchanged editor doesn't", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderDetail();
  await startEditing();

  const unchanged = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unchanged);
  expect(unchanged.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole("link", { name: "My issues" }));
  expect(confirm).not.toHaveBeenCalled();

  fireEvent.change(editor(), { target: { value: "Unsaved text" } });
  const changed = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(changed);
  expect(changed.defaultPrevented).toBe(true);

  fireEvent.click(screen.getByRole("link", { name: "My issues" }));
  expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Leave anyway?");
  expect(editor().value).toBe("Unsaved text");
});

it("REQ-013: an archived project's description has no Edit button", () => {
  renderDetail({ shown: { ...web, archivedAt: archived } });

  expect(screen.getByRole("heading", { level: 3, name: "This quarter" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit project description" })).toBeNull();
});

it("STD-7: an empty description says No description yet. and Add one. opens the editor", () => {
  renderDetail({ shown: { ...web, description: "" } });

  const empty = screen.getByText(/^No description yet\./);
  expect(empty.textContent).toBe("No description yet. Add one.");

  fireEvent.click(within(empty).getByRole("button", { name: "Add one." }));

  expect(editor().value).toBe("");
});

it("REQ-013: an archived project's empty description has no Add one.", () => {
  renderDetail({ shown: { ...web, description: "", archivedAt: archived } });

  expect(screen.getByText(/^No description yet\./).textContent).toBe("No description yet.");
  expect(screen.queryByRole("button", { name: "Add one." })).toBeNull();
});

it("REQ-046.3: the Issues section shows the open count and each status's count, linking to the list filtered by it", () => {
  renderDetail({
    shown: { ...web, issueCounts: { backlog: 3, in_progress: 1, in_review: 0, done: 2, canceled: 0 } },
  });

  const issues = screen.getByRole("region", { name: "Issues" });
  expect(within(issues).getByText(/open$/).textContent).toBe("4 open");
  expect(
    within(issues)
      .getAllByRole("link")
      .map((row) => [row.getAttribute("aria-label"), row.getAttribute("href")]),
  ).toEqual([
    ["Backlog, 3 issues. Open list view", "/project/WEB/list?status=backlog"],
    ["In Progress, 1 issue. Open list view", "/project/WEB/list?status=in_progress"],
    ["In Review, 0 issues. Open list view", "/project/WEB/list?status=in_review"],
    ["Done, 2 issues. Open list view", "/project/WEB/list?status=done"],
    ["Canceled, 0 issues. Open list view", "/project/WEB/list?status=canceled"],
  ]);
});

it("REQ-046.4: the details page shows Created {date} by its creator, or only the date when none was recorded", () => {
  renderDetail({ shown: { ...web, createdBy: alex } });

  expect(screen.getByText(/^Created\b/).textContent).toBe("Created Sep 20, 2026 by Alex Kim");

  cleanup();
  renderDetail();

  expect(screen.getByText(/^Created\b/).textContent).toBe("Created Sep 20, 2026");
});

it("NFR-007: Edit moves focus into the project description editor; Escape and Save return it to Edit", async () => {
  renderDetail();

  const escaping = await startEditing();
  await waitFor(() => expect(document.activeElement).toBe(escaping));
  fireEvent.keyDown(escaping, { key: "Escape" });
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit project description" })),
  );

  const saving = await editTo("New text");
  await waitFor(() => expect(document.activeElement).toBe(saving));
  save();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit project description" })),
  );
});