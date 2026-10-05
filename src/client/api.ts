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

type ApiRequest = string | { path: string; method: "POST" | "DELETE"; body?: unknown };

const couldNotSave = "Couldn't save. Try again.";

const signedOutPaths = ["/sign-in", "/forgot-password", "/reset-password"];

function fetchApi(request: ApiRequest, signal: AbortSignal) {
  if (typeof request === "string") return fetch(`/api/${request}`, { signal });
  if (request.body === undefined) return fetch(`/api/${request.path}`, { signal, method: request.method });
  return fetch(`/api/${request.path}`, {
    signal,
    method: request.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request.body),
  });
}

const baseQuery: BaseQueryFn<ApiRequest, unknown, ApiFailure> = async (request, { signal, extra }) => {
  let response: Response;
  try {
    response = await fetchApi(request, signal);
  } catch {
    return { error: { status: "network", message: couldNotSave } };
  }
  if (response.status === 401) {
    const { router } = extra as StoreExtra;
    const { pathname, search } = router.state.location;
    if (!signedOutPaths.includes(pathname)) {
      await router.navigate(`/sign-in?next=${encodeURIComponent(pathname + search)}`, { replace: true });
    }
  }
  if (response.status === 204) {
    return { data: null };
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
  tagTypes: ["Me"],
  endpoints: (build) => ({
    me: build.query<Me, void>({ query: () => "me", providesTags: ["Me"] }),
    signIn: build.mutation<null, { email: string; password: string }>({
      query: (body) => ({ path: "sessions", method: "POST", body }),
    }),
    signOut: build.mutation<null, void>({
      query: () => ({ path: "sessions/current", method: "DELETE" }),
      invalidatesTags: ["Me"],
    }),
    requestResetLink: build.mutation<null, { email: string }>({
      query: (body) => ({ path: "password-reset-links", method: "POST", body }),
    }),
    lookUpResetLink: build.query<null, { token: string }>({
      query: (body) => ({ path: "password-reset-lookups", method: "POST", body }),
    }),
    resetPassword: build.mutation<null, { token: string; password: string }>({
      query: (body) => ({ path: "password-resets", method: "POST", body }),
    }),
  }),
});

export const {
  useMeQuery,
  useSignInMutation,
  useSignOutMutation,
  useRequestResetLinkMutation,
  useLookUpResetLinkQuery,
  useResetPasswordMutation,
} = api;