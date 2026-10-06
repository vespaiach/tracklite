import { type BaseQueryFn, createApi } from "@reduxjs/toolkit/query/react";
import type { StoreExtra } from "./store";
import { showToast } from "./toast";

export type ApiFailure = { status: number | "network"; message: string; fields?: Record<string, string> };

export type Me = {
  username: string;
  fullName: string;
  initials: string;
  deactivated: boolean;
  email: string;
  role: "admin" | "member";
};

export type MemberSummary = Pick<Me, "username" | "fullName" | "initials" | "deactivated">;

export type Invitation = {
  id: string;
  email: string;
  state: "pending" | "bounced" | "expired";
  expiresAt: string;
  invitedBy: MemberSummary;
};

export type InvitationLookup = { email: string };

export type ProjectSummary = { key: string; name: string; archivedAt: string | null };

export type Project = ProjectSummary & {
  description: string;
  descriptionVersion: number;
  mentions: MemberSummary[];
};

export type LabelColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

export type Label = { id: string; name: string; color: LabelColor; issueCount: number };

export type IssueStatus = "backlog" | "in_progress" | "in_review" | "done" | "canceled";

export type IssuePriority = "none" | "urgent" | "high" | "medium" | "low";

export type IssueLabel = Pick<Label, "id" | "name" | "color">;

export type Issue = {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: MemberSummary | null;
  createdBy: MemberSummary;
  createdAt: string;
  updatedAt: string;
  labels: IssueLabel[];
  descriptionVersion: number;
  mentions: MemberSummary[];
  archived: boolean;
};

export type BoardIssue = Pick<Issue, "id" | "title" | "priority" | "assignee" | "labels">;

export type BoardStatusColumn = { status: IssueStatus; count: number; cards: BoardIssue[] };

export type Board = BoardStatusColumn[];

export type BoardPlace = "top" | "bottom" | { after: string };

export type IssueChange =
  | { title: string }
  | { status: IssueStatus }
  | { priority: IssuePriority }
  | { assignee: string | null }
  | { labelIds: string[] }
  | { description: string; descriptionVersion: number };

type ApiRequest = string | { path: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown };

const couldNotSave = "Couldn't save. Try again.";

function placeCard(board: Board, id: string, status: IssueStatus, place: BoardPlace) {
  const from = board.find((column) => column.cards.some((card) => card.id === id));
  const to = board.find((column) => column.status === status);
  if (!from || !to) return;
  const [card] = from.cards.splice(
    from.cards.findIndex((each) => each.id === id),
    1,
  );
  from.count -= 1;
  const after = typeof place === "object" ? to.cards.findIndex((each) => each.id === place.after) : -1;
  const index = place === "bottom" ? to.cards.length : after + 1;
  to.cards.splice(index, 0, card);
  to.count += 1;
}

function projectKeyOf(id: string) {
  return id.slice(0, id.lastIndexOf("-"));
}

const signedOutPaths = ["/sign-in", "/forgot-password", "/reset-password", "/invite"];

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
  tagTypes: ["Me", "Members", "Invitations", "Projects", "Labels", "Issue", "Board"],
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
    lookUpInvitation: build.query<InvitationLookup, { token: string }>({
      query: (body) => ({ path: "invitation-lookups", method: "POST", body }),
    }),
    acceptInvitation: build.mutation<
      Me,
      { token: string; fullName: string; username: string; password: string }
    >({
      query: (body) => ({ path: "members", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),
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
    createProject: build.mutation<Project, { name: string; key: string }>({
      query: (body) => ({ path: "projects", method: "POST", body }),
      invalidatesTags: ["Projects"],
    }),
    updateProject: build.mutation<
      Project,
      { key: string; name?: string; archived?: boolean; description?: string; descriptionVersion?: number }
    >({
      query: ({ key, ...body }) => ({ path: `projects/${key}`, method: "PATCH", body }),
      invalidatesTags: ["Projects"],
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
    issue: build.query<Issue, string>({ query: (id) => `issues/${id}`, providesTags: ["Issue"] }),
    createIssue: build.mutation<
      Issue,
      { key: string; requestId: string; title: string; status?: IssueStatus }
    >({
      query: ({ key, ...body }) => ({ path: `projects/${key}/issues`, method: "POST", body }),
    }),
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
    board: build.query<Board, string>({ query: (key) => `projects/${key}/board`, providesTags: ["Board"] }),
    moveIssue: build.mutation<Issue, { id: string; status: IssueStatus; place: BoardPlace }>({
      query: ({ id, ...body }) => ({ path: `issues/${id}/position`, method: "PUT", body }),
      invalidatesTags: (result, error) => (result || error?.status === 404 ? ["Board"] : []),
      async onQueryStarted({ id, status, place }, { dispatch, queryFulfilled }) {
        const moved = dispatch(
          api.util.updateQueryData("board", projectKeyOf(id), (board) => placeCard(board, id, status, place)),
        );
        try {
          await queryFulfilled;
        } catch (failure) {
          moved.undo();
          const { status: code, message } = (failure as { error: ApiFailure }).error;
          dispatch(showToast(code === "network" || code >= 500 ? `Couldn't move ${id}` : message));
        }
      },
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
  useLookUpInvitationQuery,
  useAcceptInvitationMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useMembersQuery,
  useUpdateMemberMutation,
  useInvitationsQuery,
  useCreateInvitationMutation,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
  useProjectsQuery,
  useProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useLabelsQuery,
  useCreateLabelMutation,
  useUpdateLabelMutation,
  useDeleteLabelMutation,
  useIssueQuery,
  useCreateIssueMutation,
  useUpdateIssueMutation,
  useDeleteIssueMutation,
  useBoardQuery,
  useMoveIssueMutation,
} = api;