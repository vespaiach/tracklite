import type { ReactNode } from "react";
import { type Location, Navigate, useLocation } from "react-router";
import { type ApiFailure, type Project, useProjectQuery } from "./api";
import { LoadFailed, Loading } from "./LoadStates";
import { NotFound } from "./screens/NotFound";
import { useShowLoading } from "./useShowLoading";

function canonicalAddress({ pathname, search, hash }: Location, typedKey: string, key: string) {
  const typedPrefix = `/project/${typedKey}`;
  const rest = pathname.slice(typedPrefix.length);
  const addressedByTypedKey = pathname.startsWith(typedPrefix) && (rest === "" || rest.startsWith("/"));
  if (typedKey === key || !addressedByTypedKey) return undefined;
  return { pathname: `/project/${key}${rest}`, search, hash };
}

export function ProjectGate({
  projectKey,
  children,
}: {
  projectKey: string;
  children: (project: Project) => ReactNode;
}) {
  const query = useProjectQuery(projectKey);
  const showLoading = useShowLoading(query.isLoading);
  const location = useLocation();
  if ((query.error as ApiFailure | undefined)?.status === 404) return <NotFound />;
  if (query.isError) return <LoadFailed onRetry={query.refetch} />;
  if (!query.data) return <Loading show={showLoading} />;

  const canonical = canonicalAddress(location, projectKey, query.data.key);
  if (canonical) {
    return (
      <Navigate
        to={canonical}
        replace
      />
    );
  }
  return children(query.data);
}