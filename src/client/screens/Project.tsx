import { useParams } from "react-router";
import { useMeQuery } from "../api";
import { ProjectGate } from "../ProjectGate";
import { ProjectHeader, type ProjectView } from "../ProjectHeader";
import { BoardView } from "./Board";

function ProjectPage({ view }: { view: ProjectView }) {
  const { key = "" } = useParams();
  const { data: me } = useMeQuery();
  return (
    <ProjectGate projectKey={key}>
      {(project) => (
        <>
          <ProjectHeader
            project={project}
            view={view}
            admin={me?.role === "admin"}
          />
          {view === "board" && <BoardView project={project} />}
        </>
      )}
    </ProjectGate>
  );
}

export function ProjectBoard() {
  return <ProjectPage view="board" />;
}

export function ProjectList() {
  return <ProjectPage view="list" />;
}