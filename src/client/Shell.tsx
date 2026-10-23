import { useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { matchPath, Outlet, useLocation, useNavigate } from "react-router";
import { AppShell } from "../components/ui/track-lite";
import {
  type ApiFailure,
  api,
  useCreateProjectMutation,
  useMeQuery,
  useProjectsQuery,
  useSignOutMutation,
} from "./api";
import { useFailureToast } from "./failure";
import { type NewProject, NewProjectDialog } from "./NewProjectDialog";
import { Sidebar } from "./Sidebar";

export function Shell() {
  const { data: me, isSuccess } = useMeQuery();
  const { data: projects } = useProjectsQuery({ archived: false });
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const signOut = useSignOutAndLeave();
  const archivedProjectOpen = useArchivedProjectOpen(pathname);

  return (
    <AppShell
      rail={
        <Sidebar
          admin={me?.role === "admin"}
          projects={projects}
          pathname={pathname}
          archivedProjectOpen={archivedProjectOpen}
          onNewProject={() => setCreating(true)}
          member={me}
          onProfile={() => navigate("/settings/profile")}
          onSignOut={signOut}
        />
      }>
      {isSuccess && <Outlet />}
      {creating && <CreateProject onDone={() => setCreating(false)} />}
    </AppShell>
  );
}

function useArchivedProjectOpen(pathname: string) {
  const projectKey = matchPath("/project/:key/*", pathname)?.params.key;
  const issueId = matchPath("/issue/:id", pathname)?.params.id;

  const project = api.endpoints.project.useQueryState(projectKey ?? skipToken).data;
  const issue = api.endpoints.issue.useQueryState(issueId ?? skipToken).data;

  return Boolean(project?.archivedAt || issue?.archived);
}

function useSignOutAndLeave() {
  const [signOut] = useSignOutMutation();
  const navigate = useNavigate();
  const toastFailure = useFailureToast();

  return async () => {
    try {
      await signOut().unwrap();
      await navigate("/sign-in", { replace: true });
    } catch (caught) {
      toastFailure(caught as ApiFailure);
    }
  };
}

function CreateProject({ onDone }: { onDone: () => void }) {
  const [createProject, { isLoading }] = useCreateProjectMutation();
  const navigate = useNavigate();
  const toastFailure = useFailureToast();
  const [errors, setErrors] = useState<Partial<NewProject>>({});

  async function create(project: NewProject) {
    setErrors({});
    try {
      const created = await createProject(project).unwrap();
      onDone();
      await navigate(`/project/${created.key}`);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422 && failure.fields) {
        setErrors(failure.fields);
      } else {
        toastFailure(failure);
      }
    }
  }

  return (
    <NewProjectDialog
      busy={isLoading}
      errors={errors}
      onCancel={onDone}
      onCreate={create}
    />
  );
}