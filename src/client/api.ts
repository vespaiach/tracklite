import { type BaseQueryFn, createApi } from "@reduxjs/toolkit/query/react";
import type {
  Issue,
  IssueListPage,
  IssuePriority,
  IssueStatus,
  Label,
  LabelColor,
  Me,
  Project,
  ThreadComment,
} from "../contract";
import type { StoreExtra } from "./store";
import { loadPage } from "../lib/load-page";

export type * from "../contract";

export type ApiFailure = { status: number | "network"; message: string; fields?: Record<string, string> };

const issueListPageSize = 100;

function issueListPath(key: string, query: string, offset: number) {
  const params = new URLSearchParams(query);
  if (offset > 0) params.set("offset", String(offset));
  const search = params.toString();
  return `projects/${key}/issues${search ? `?${search}` : ""}`;
}

export type IssueChange =
  | { title: string }
  | { status: IssueStatus }
  | { priority: IssuePriority }
  | { assignees: string[] }
  | { labelIds: string[] }
  | { description: string; descriptionVersion: number };

type ApiRequest = string | { path: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown };

const couldNotSave = "Couldn’t save. Try again.";

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
    loadPage(`/sign-in?next=${encodeURIComponent(pathname + search)}`);
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
  tagTypes: ["Projects", "Labels", "Issue", "Comments"],
  endpoints: (build) => ({
    me: build.query<Me, void>({ query: () => "me" }),
    members: build.query<Me[], void>({ query: () => "members" }),
    project: build.query<Project, string>({
      query: (key) => `projects/${key}`,
      providesTags: ["Projects"],
    }),
    updateProject: build.mutation<
      Project,
      { key: string; name?: string; archived?: boolean; description?: string; descriptionVersion?: number }
    >({
      query: ({ key, ...body }) => ({ path: `projects/${key}`, method: "PATCH", body }),
      invalidatesTags: ["Projects"],
    }),
    labels: build.query<Label[], string>({
      query: (key) => `projects/${key}/labels`,
      providesTags: ["Labels"],
    }),
    createLabel: build.mutation<Label, { key: string; name: string; color: LabelColor }>({
      query: ({ key, ...body }) => ({ path: `projects/${key}/labels`, method: "POST", body }),
      invalidatesTags: (result) => (result ? ["Labels"] : []),
    }),
    issue: build.query<Issue, string>({ query: (id) => `issues/${id}`, providesTags: ["Issue"] }),
    updateIssue: build.mutation<Issue, { id: string; change: IssueChange }>({
      query: ({ id, change }) => ({ path: `issues/${id}`, method: "PATCH", body: change }),
      invalidatesTags: (_result, error) => (error?.status === 404 ? ["Labels"] : []),
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const saved = await queryFulfilled.catch(() => undefined);
        if (saved) dispatch(api.util.upsertQueryData("issue", id, saved.data));
      },
    }),
    deleteIssue: build.mutation<null, string>({
      query: (id) => ({ path: `issues/${id}`, method: "DELETE" }),
    }),
    issueList: build.infiniteQuery<IssueListPage, { key: string; query: string }, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.hasMore ? lastOffset + issueListPageSize : undefined,
      },
      query: ({ queryArg, pageParam }) => issueListPath(queryArg.key, queryArg.query, pageParam),
    }),
    comments: build.query<ThreadComment[], string>({
      query: (threadPath) => threadPath,
      providesTags: ["Comments"],
    }),
    postComment: build.mutation<ThreadComment, { threadPath: string; requestId: string; body: string }>({
      query: ({ threadPath, ...body }) => ({ path: threadPath, method: "POST", body }),
      invalidatesTags: (result) => (result ? ["Comments"] : []),
    }),
    editComment: build.mutation<ThreadComment, { id: string; body: string; version: number }>({
      query: ({ id, ...body }) => ({ path: `comments/${id}`, method: "PATCH", body }),
      invalidatesTags: (result) => (result ? ["Comments"] : []),
    }),
    deleteComment: build.mutation<null, string>({
      query: (id) => ({ path: `comments/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, error) => (!error || error.status === 404 ? ["Comments"] : []),
    }),
  }),
});

export const {
  useMeQuery,
  useMembersQuery,
  useProjectQuery,
  useLazyProjectQuery,
  useUpdateProjectMutation,
  useLabelsQuery,
  useCreateLabelMutation,
  useIssueQuery,
  useLazyIssueQuery,
  useUpdateIssueMutation,
  useDeleteIssueMutation,
  useIssueListInfiniteQuery,
  useCommentsQuery,
  usePostCommentMutation,
  useEditCommentMutation,
  useDeleteCommentMutation,
} = api;