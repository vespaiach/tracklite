import { type BaseQueryFn, createApi } from "@reduxjs/toolkit/query/react";
import type {
  Invitation,
  IssueListPage,
  Label,
  LabelColor,
  Me,
  NotificationStats,
  Project,
  ProjectSummary,
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
  tagTypes: ["Me", "Members", "Invitations", "Projects", "Labels", "Comments"],
  endpoints: (build) => ({
    me: build.query<Me, void>({ query: () => "me", providesTags: ["Me"] }),
    updateProfile: build.mutation<Me, { fullName: string }>({
      query: (body) => ({ path: "me", method: "PATCH", body }),
      invalidatesTags: ["Me"],
    }),
    members: build.query<Me[], void>({ query: () => "members", providesTags: ["Members"] }),
    updateMember: build.mutation<Me, { username: string; role?: Me["role"]; deactivated?: boolean }>({
      query: ({ username, ...body }) => ({ path: `members/${username}`, method: "PATCH", body }),
      invalidatesTags: ["Members", "Me"],
    }),
    invitations: build.query<Invitation[], void>({
      query: () => "invitations",
      providesTags: ["Invitations"],
    }),
    createInvitation: build.mutation<Invitation, { email: string }>({
      query: (body) => ({ path: "invitations", method: "POST", body }),
      invalidatesTags: ["Invitations"],
    }),
    resendInvitation: build.mutation<Invitation, string>({
      query: (id) => ({ path: `invitations/${id}/resend`, method: "POST" }),
      invalidatesTags: ["Invitations"],
    }),
    revokeInvitation: build.mutation<null, string>({
      query: (id) => ({ path: `invitations/${id}`, method: "DELETE" }),
      invalidatesTags: ["Invitations"],
    }),
    notificationStats: build.query<NotificationStats, void>({ query: () => "notification-stats" }),
    changePassword: build.mutation<null, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ path: "me/password", method: "PUT", body }),
    }),
    projects: build.query<ProjectSummary[], { archived: boolean }>({
      query: ({ archived }) => `projects?archived=${archived}`,
      providesTags: ["Projects"],
    }),
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
      async onQueryStarted(_change, { extra, queryFulfilled }) {
        if (await queryFulfilled.catch(() => undefined)) (extra as StoreExtra).refreshServer();
      },
    }),
    deleteProject: build.mutation<null, string>({
      query: (key) => ({ path: `projects/${key}`, method: "DELETE" }),
    }),
    labels: build.query<Label[], string>({
      query: (key) => `projects/${key}/labels`,
      providesTags: ["Labels"],
    }),
    createLabel: build.mutation<Label, { key: string; name: string; color: LabelColor }>({
      query: ({ key, ...body }) => ({ path: `projects/${key}/labels`, method: "POST", body }),
      invalidatesTags: (result) => (result ? ["Labels"] : []),
    }),
    updateLabel: build.mutation<Label, { id: string; name?: string; color?: LabelColor }>({
      query: ({ id, ...body }) => ({ path: `labels/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, error) => (result || error?.status === 404 ? ["Labels"] : []),
    }),
    deleteLabel: build.mutation<null, string>({
      query: (id) => ({ path: `labels/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, error) => (!error || error.status === 404 ? ["Labels"] : []),
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
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useMembersQuery,
  useUpdateMemberMutation,
  useInvitationsQuery,
  useCreateInvitationMutation,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
  useNotificationStatsQuery,
  useProjectsQuery,
  useProjectQuery,
  useLazyProjectQuery,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useLabelsQuery,
  useCreateLabelMutation,
  useUpdateLabelMutation,
  useDeleteLabelMutation,
  useIssueListInfiniteQuery,
  useCommentsQuery,
  usePostCommentMutation,
  useEditCommentMutation,
  useDeleteCommentMutation,
} = api;