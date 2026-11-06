import { createMemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { loadPage } from "../lib/load-page";
import { makeStore } from "./store";

vi.mock("../lib/load-page", () => ({ loadPage: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

function storeAt(path: string) {
  const router = createMemoryRouter([{ path: "*" }], { initialEntries: [path] });
  return { router, store: makeStore(router, () => {}) };
}

function respondWith(status: number, body?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      body === undefined ? new Response(null, { status }) : Response.json(body, { status }),
    ),
  );
}

it("STD-1: a 401 from any request redirects to /sign-in?next={current address}", async () => {
  respondWith(401, { error: { message: "Sign in to continue." } });
  const { store } = storeAt("/project/WEB/list?status=todo");

  await store.dispatch(api.endpoints.me.initiate());

  expect(loadPage).toHaveBeenCalledWith(
    `/sign-in?next=${encodeURIComponent("/project/WEB/list?status=todo")}`,
  );
});

it('STD-9.3: a network or server error reads "Couldn’t save. Try again."', async () => {
  respondWith(500, { error: { message: "Internal details" } });
  const serverError = await storeAt("/my-issues").store.dispatch(api.endpoints.me.initiate());
  expect(serverError.error).toEqual({ status: 500, message: "Couldn’t save. Try again." });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  const networkError = await storeAt("/my-issues").store.dispatch(api.endpoints.me.initiate());
  expect(networkError.error).toEqual({ status: "network", message: "Couldn’t save. Try again." });
});

it("STD-9.3, STD-6: any other failure (403, 503) shows the server's message", async () => {
  respondWith(403, { error: { message: "You don't have permission to do that." } });
  const { router, store } = storeAt("/my-issues");

  const forbidden = await store.dispatch(api.endpoints.me.initiate());

  expect(forbidden.error).toEqual({ status: 403, message: "You don't have permission to do that." });
  expect(router.state.location.pathname).toBe("/my-issues");

  respondWith(503, { error: { message: "We couldn’t send the email. Try again." } });
  const unavailable = await storeAt("/settings/members").store.dispatch(
    api.endpoints.createInvitation.initiate({ email: "sam@acme.com" }),
  );

  expect(unavailable.error).toEqual({ status: 503, message: "We couldn’t send the email. Try again." });
});

it("STD-3: baseQuery passes a 422's field errors to the component without redirecting", async () => {
  const body = {
    error: { message: "Check the highlighted fields.", fields: { fullName: "Can't be blank" } },
  };
  respondWith(422, body);
  const { router, store } = storeAt("/settings/profile");

  const result = await store.dispatch(api.endpoints.me.initiate());

  expect(result.error).toEqual({ status: 422, ...body.error });
  expect(router.state.location.pathname).toBe("/settings/profile");
  expect(store.getState().toast).toBeNull();
});

it("baseQuery: GET returns parsed JSON; PUT sends a JSON body and a 204 gives null", async () => {
  const me = {
    username: "sam",
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: "sam@acme.com",
    role: "member",
  };
  respondWith(200, me);

  const result = await storeAt("/my-issues").store.dispatch(api.endpoints.me.initiate());

  expect(result.data).toEqual(me);
  expect(fetch).toHaveBeenCalledWith("/api/me", expect.anything());

  respondWith(204);
  const changed = await storeAt("/settings/profile").store.dispatch(
    api.endpoints.changePassword.initiate({
      currentPassword: "correct-horse-battery",
      newPassword: "a brand new password",
    }),
  );

  expect(changed.data).toBeNull();
  expect(fetch).toHaveBeenCalledWith(
    "/api/me/password",
    expect.objectContaining({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "correct-horse-battery", newPassword: "a brand new password" }),
    }),
  );
});