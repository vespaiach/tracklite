import { type BaseQueryFn, createApi } from "@reduxjs/toolkit/query/react";
import type { StoreExtra } from "./store";

export type ApiFailure = { status: number | "network"; message: string; fields?: Record<string, string> };

export type Me = {
  username: string;
  fullName: string;
  initials: string;
  deactivated: boolean;
  email: string;
  role: "admin" | "member";
};

const couldNotSave = "Couldn't save. Try again.";

const baseQuery: BaseQueryFn<string, unknown, ApiFailure> = async (path, { signal, extra }) => {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { signal });
  } catch {
    return { error: { status: "network", message: couldNotSave } };
  }
  if (response.status === 401) {
    const { router } = extra as StoreExtra;
    const { pathname, search } = router.state.location;
    await router.navigate(`/sign-in?next=${encodeURIComponent(pathname + search)}`, { replace: true });
  }
  if (response.ok) {
    return { data: await response.json() };
  }
  if (response.status >= 500) {
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