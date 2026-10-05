import type { ReactNode } from "react";
import { type ApiFailure, type Project, useProjectQuery } from "./api";
import { LoadFailed, Loading } from "./LoadStates";
import { NotFound } from "./screens/NotFound";
import { useShowLoading } from "./useShowLoading";

export function ProjectGate({
  projectKey,
  children,
}: {
  projectKey: string;
  children: (project: Project) => ReactNode;
}) {
  const query = useProjectQuery(projectKey);
  const showLoading = useShowLoading(query.isLoading);
  if ((query.error as ApiFailure | undefined)?.status === 404) return <NotFound />;
  if (query.isError) return <LoadFailed onRetry={query.refetch} />;
  if (!query.data) return <Loading show={showLoading} />;
  return children(query.data);
}