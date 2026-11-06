import { AppBar, AppBarTitle, IssueEmpty, SettingsLayout, Table } from "../../components/ui/track-lite";
import { type ProjectSummary, useProjectsQuery } from "../api";
import { formatDate } from "../dates";
import { Zone, zoneState } from "../Zone";

export function ArchivedProjects() {
  return (
    <>
      <AppBar>
        <AppBarTitle>Archived projects</AppBarTitle>
      </AppBar>
      <ArchivedList />
    </>
  );
}

function ArchivedList() {
  const query = useProjectsQuery({ archived: true });

  return (
    <Zone
      what="archived projects"
      state={zoneState(query)}
      retry={query.refetch}
      page>
      {(projects) => <ArchivedTable projects={projects} />}
    </Zone>
  );
}

function ArchivedTable({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length === 0) {
    return (
      <SettingsLayout>
        <IssueEmpty>No archived projects.</IssueEmpty>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout wide>
      <Table aria-label="Archived projects">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Archived</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.key}>
              <td>
                <a href={`/project/${project.key}`}>{`${project.name} · ${project.key}`}</a>
              </td>
              <td className="tl-table__mono tl-table__muted">
                {project.archivedAt && (
                  <time dateTime={project.archivedAt}>{formatDate(project.archivedAt)}</time>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </SettingsLayout>
  );
}