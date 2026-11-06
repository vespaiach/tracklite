import { render } from "@testing-library/react";
import { vi } from "vitest";
import ClientApp from "../client/ClientApp";
import { ToastProvider } from "../components/toast";
import type { Issue, Me, MemberSummary, Project, ProjectSummary } from "../client/api";

type Handler = (body: unknown) => Response | Promise<Response>;

export const sam: Me = {
  username: "sam",
  fullName: "Sam Lee",
  initials: "SL",
  deactivated: false,
  email: "sam@acme.com",
  role: "member",
};

export const alex: Me = {
  username: "alex",
  fullName: "Alex Kim",
  initials: "AK",
  deactivated: false,
  email: "alex@acme.com",
  role: "member",
};

export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unmocked request ${key}`);
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function apiError(status: number, message: string, fields?: Record<string, string>) {
  return Response.json({ error: { message, fields } }, { status });
}

export const signedOut = () => apiError(401, "Sign in to continue.");

export const noContent = () => new Response(null, { status: 204 });

export function never(): Promise<Response> {
  return new Promise(() => {});
}

export function deferred() {
  let resolve!: (response: Response) => void;
  const answer = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { answer: () => answer, resolve };
}

export function networkError(): never {
  throw new TypeError("Failed to fetch");
}

export const refreshServer = vi.fn();

export const createIssue = vi.fn();

export function renderAppAt(path: string) {
  window.history.replaceState(null, "", path);
  refreshServer.mockClear();
  createIssue.mockReset();
  return render(
    <ToastProvider>
      <ClientApp
        refreshServer={refreshServer}
        createIssue={createIssue}
      />
    </ToastProvider>,
  );
}

export function requestsTo(fetchMock: ReturnType<typeof mockApi>, key: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
}

export const admin: Me = { ...sam, role: "admin" };

export function project(key: string, name: string, archivedAt: string | null = null): Project {
  return {
    key,
    name,
    description: "",
    descriptionVersion: 0,
    mentions: [],
    archivedAt,
    issueCounts: { backlog: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
    createdAt: "2026-09-20T10:42:00.000Z",
    createdBy: null,
  };
}

export function summary({ key, name, archivedAt }: Project): ProjectSummary {
  return { key, name, archivedAt };
}

export function memberOf({ username, fullName, initials, deactivated }: Me): MemberSummary {
  return { username, fullName, initials, deactivated };
}

export function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "WEB-42",
    title: "Fix login button",
    description: "",
    status: "in_progress",
    priority: "high",
    assignees: [memberOf(alex)],
    createdBy: memberOf(sam),
    createdAt: "2026-09-20T10:42:00.000Z",
    updatedAt: "2026-09-20T10:42:00.000Z",
    labels: [],
    descriptionVersion: 0,
    mentions: [],
    archived: false,
    ...overrides,
  };
}