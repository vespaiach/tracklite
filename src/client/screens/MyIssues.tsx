import {
  AppBar,
  AppBarTitle,
  BoardEmpty,
  ListGroup,
  Priority,
  SettingsLayout,
  Status,
  Table,
} from "../../components/ui/track-lite";
import { type MyIssue, type MyIssueGroup, useMyIssuesQuery } from "../api";
import { LabelPills, TitleLink, UpdatedAt } from "../IssueCells";
import { priorities, statuses } from "../issue-fields";
import { LoadFailed, Loading } from "../LoadStates";
import { useShowLoading } from "../useShowLoading";

const columns = {
  priority: "40px",
  id: "90px",
  title: "auto",
  project: "220px",
  labels: "210px",
  updated: "120px",
};

export function MyIssues() {
  const myIssues = useMyIssuesQuery();
  const showLoading = useShowLoading(myIssues.isLoading);
  const groups = myIssues.data;

  return (
    <>
      <AppBar>
        <AppBarTitle>My issues</AppBarTitle>
      </AppBar>
      {myIssues.isError && !groups ? (
        <LoadFailed onRetry={myIssues.refetch} />
      ) : !groups ? (
        <Loading show={showLoading} />
      ) : groups.length === 0 ? (
        <SettingsLayout>
          <BoardEmpty>Nothing assigned to you</BoardEmpty>
        </SettingsLayout>
      ) : (
        <div className="tl-table-scroll">
          {groups.map((group) => (
            <IssueGroup
              key={group.status}
              group={group}
            />
          ))}
        </div>
      )}
    </>
  );
}

function IssueGroup({ group }: { group: MyIssueGroup }) {
  const { name, kind } = statuses[group.status];
  return (
    <section aria-label={`${name}, ${group.count} ${group.count === 1 ? "issue" : "issues"}`}>
      <ListGroup
        label={name}
        count={group.count}
        icon={
          <span aria-hidden="true">
            <Status status={kind} />
          </span>
        }
      />
      <Table
        columns={columns}
        minWidth="900px">
        <tbody>
          {group.issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
            />
          ))}
        </tbody>
      </Table>
    </section>
  );
}

function IssueRow({ issue }: { issue: MyIssue }) {
  const { name: priorityName, kind: priorityKind } = priorities[issue.priority];
  return (
    <tr className="tl-table__row">
      <td>
        <span
          className="tl-table__cell"
          title={priorityName}>
          {issue.priority !== "none" && <Priority priority={priorityKind} />}
        </span>
      </td>
      <td>
        <span className="tl-list-row__id">{issue.id}</span>
      </td>
      <td>
        <TitleLink issue={issue} />
      </td>
      <td>
        <span
          className="tl-table__cell"
          title={issue.projectName}>
          <span className="tl-table__muted">{issue.projectName}</span>
        </span>
      </td>
      <td>
        <LabelPills labels={issue.labels} />
      </td>
      <td>
        <UpdatedAt at={issue.updatedAt} />
      </td>
    </tr>
  );
}