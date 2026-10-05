import { render } from "@testing-library/react";
import { vi } from "vitest";
import ClientApp from "../client/ClientApp";
import type { Me } from "../client/api";

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

export function networkError(): never {
  throw new TypeError("Failed to fetch");
}

export function renderAppAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<ClientApp />);
}

export function requestsTo(fetchMock: ReturnType<typeof mockApi>, key: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
}