"use client";

import { formatDate } from "../../../../client/dates";
import { Link } from "../../../../components/leave-guard";
import { IssueEmpty, SettingsLayout, Table } from "../../../../components/ui/track-lite";
import type { ProjectSummary } from "../../../../contract";

export function ArchivedProjects({ projects }: { projects: ProjectSummary[] }) {
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
                <Link href={`/project/${project.key}`}>{`${project.name} · ${project.key}`}</Link>
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