import type { ReactNode } from "react";
import { type Location, Navigate, useLocation } from "react-router";
import { type ApiFailure, type Project, useProjectQuery } from "./api";
import { NotFound } from "./screens/NotFound";
import { Zone, zoneState } from "./Zone";

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
  const location = useLocation();
  if ((query.error as ApiFailure | undefined)?.status === 404) return <NotFound />;
  return (
    <Zone
      what="this project"
      state={zoneState(query)}
      retry={query.refetch}
      page>
      {(project) => {
        const canonical = canonicalAddress(location, projectKey, project.key);
        if (!canonical) return children(project);
        return (
          <Navigate
            to={canonical}
            replace
          />
        );
      }}
    </Zone>
  );
}