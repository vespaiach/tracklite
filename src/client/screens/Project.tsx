import { useParams } from "react-router";
import { useMeQuery } from "../api";
import { ProjectGate } from "../ProjectGate";
import { ProjectHeader } from "../ProjectHeader";
import { ListView } from "./List";

export function ProjectList() {
  const { key = "" } = useParams();
  const { data: me } = useMeQuery();
  return (
    <ProjectGate projectKey={key}>
      {(project) => (
        <>
          <ProjectHeader
            project={project}
            view="list"
            admin={me?.role === "admin"}
          />
          <ListView project={project} />
        </>
      )}
    </ProjectGate>
  );
}