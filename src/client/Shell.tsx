import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AppShell } from "../components/ui/track-lite";
import { type ApiFailure, useCreateProjectMutation, useMeQuery, useProjectsQuery } from "./api";
import { useFailureToast } from "./failure";
import { type NewProject, NewProjectDialog } from "./NewProjectDialog";
import { Sidebar } from "./Sidebar";

export function Shell() {
  const { data: me, isSuccess } = useMeQuery();
  const { data: projects } = useProjectsQuery({ archived: false });
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);

  return (
    <AppShell
      rail={
        <Sidebar
          admin={me?.role === "admin"}
          projects={projects}
          pathname={pathname}
          onNewProject={() => setCreating(true)}
        />
      }>
      {isSuccess && <Outlet />}
      {creating && <CreateProject onDone={() => setCreating(false)} />}
    </AppShell>
  );
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