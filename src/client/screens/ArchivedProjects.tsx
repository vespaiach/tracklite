import { Link } from "react-router";
import { AppBar, AppBarTitle, SettingsEmpty, SettingsLayout, Table } from "../../components/ui/track-lite";
import { useProjectsQuery } from "../api";
import { formatDate } from "../dates";
import { LoadFailed, Loading } from "../LoadStates";
import { useShowLoading } from "../useShowLoading";

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
  const showLoading = useShowLoading(query.isLoading);

  if (query.isError) return <LoadFailed onRetry={query.refetch} />;
  if (!query.data) return <Loading show={showLoading} />;
  if (query.data.length === 0) {
    return (
      <SettingsLayout>
        <SettingsEmpty>No archived projects.</SettingsEmpty>
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
          {query.data.map((project) => (
            <tr key={project.key}>
              <td>
                <Link to={`/project/${project.key}`}>{`${project.name} · ${project.key}`}</Link>
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