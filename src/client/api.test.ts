import { createMemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { makeStore } from "./store";

afterEach(() => {
  vi.unstubAllGlobals();
});

function storeAt(path: string) {
  const router = createMemoryRouter([{ path: "*" }], { initialEntries: [path] });
  return { router, store: makeStore(router) };
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
  const { router, store } = storeAt("/project/WEB/list?status=todo");

  await store.dispatch(api.endpoints.me.initiate());

  expect(router.state.location.pathname).toBe("/sign-in");
  expect(router.state.location.search).toBe(`?next=${encodeURIComponent("/project/WEB/list?status=todo")}`);
});

it('STD-9.3: a network or server error reads "Couldn\'t save. Try again."', async () => {
  respondWith(500, { error: { message: "Internal details" } });
  const serverError = await storeAt("/my-issues").store.dispatch(api.endpoints.me.initiate());
  expect(serverError.error).toEqual({ status: 500, message: "Couldn't save. Try again." });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  const networkError = await storeAt("/my-issues").store.dispatch(api.endpoints.me.initiate());
  expect(networkError.error).toEqual({ status: "network", message: "Couldn't save. Try again." });
});

it("STD-9.3: any other failure shows the server's message", async () => {
  respondWith(403, { error: { message: "You don't have permission to do that." } });
  const { router, store } = storeAt("/my-issues");

  const result = await store.dispatch(api.endpoints.me.initiate());

  expect(result.error).toEqual({ status: 403, message: "You don't have permission to do that." });
  expect(router.state.location.pathname).toBe("/my-issues");
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

it("baseQuery returns the parsed JSON body on success", async () => {
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
});