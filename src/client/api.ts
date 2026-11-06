import { type BaseQueryFn, createApi } from "@reduxjs/toolkit/query/react";
import type { Me } from "../contract";
import type { StoreExtra } from "./store";
import { loadPage } from "../lib/load-page";

export type * from "../contract";

export type ApiFailure = { status: number | "network"; message: string; fields?: Record<string, string> };

const couldNotSave = "Couldn’t save. Try again.";

const baseQuery: BaseQueryFn<string, unknown, ApiFailure> = async (request, { signal, extra }) => {
  let response: Response;
  try {
    response = await fetch(`/api/${request}`, { signal });
  } catch {
    return { error: { status: "network", message: couldNotSave } };
  }
  if (response.status === 401) {
    const { router } = extra as StoreExtra;
    const { pathname, search } = router.state.location;
    loadPage(`/sign-in?next=${encodeURIComponent(pathname + search)}`);
  }
  if (response.ok) {
    return { data: await response.json() };
  }
  if (response.status >= 500 && response.status !== 503) {
    return { error: { status: response.status, message: couldNotSave } };
  }
  const { error } = await response.json();
  return { error: { status: response.status, ...error } };
};

export const api = createApi({
  baseQuery,
  refetchOnMountOrArgChange: true,
  endpoints: (build) => ({
    me: build.query<Me, void>({ query: () => "me" }),
  }),
});

export const { useMeQuery } = api;