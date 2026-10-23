import {
  AppBar,
  AppBarCount,
  AppBarTitle,
  CollapsibleListGroup,
  FormStatus,
  ListNote,
  ListRowHead,
  ListRowLink,
  Priority,
  SettingsLayout,
  Status,
} from "../../components/ui/track-lite";
import { type IssueStatus, type MyIssue, type MyIssueGroup, useMyIssuesQuery } from "../api";
import { formatExact } from "../dates";
import { LabelPills, UpdatedAt } from "../IssueCells";
import { priorities, statuses } from "../issue-fields";
import { useRouterClick } from "../links";
import { LoadFailed, Loading } from "../LoadStates";
import { useShowLoading } from "../useShowLoading";

const columns = "14px 64px minmax(240px, 1fr) minmax(100px, 140px) minmax(0, 180px) 100px";

const collapsedStatuses: IssueStatus[] = ["done", "canceled"];

function issueCount(count: number) {
  return `${count} ${count === 1 ? "issue" : "issues"}`;
}

function groupId(status: IssueStatus) {
  return `my-issues-${status}`;
}

export function MyIssues() {
  const myIssues = useMyIssuesQuery();
  const showLoading = useShowLoading(myIssues.isLoading);
  const groups = myIssues.data;
  const total = groups?.reduce((sum, group) => sum + group.count, 0) ?? 0;

  return (
    <>
      <AppBar>
        <AppBarTitle>My issues</AppBarTitle>
        {total > 0 && (
          <AppBarCount
            count={total}
            label={issueCount(total)}
          />
        )}
      </AppBar>
      {myIssues.isError && !groups ? (
        <LoadFailed onRetry={myIssues.refetch} />
      ) : !groups ? (
        <Loading show={showLoading} />
      ) : groups.length === 0 ? (
        <SettingsLayout>
          <FormStatus>Nothing assigned to you. Open a project to find or create issues.</FormStatus>
        </SettingsLayout>
      ) : (
        <IssueGroups groups={groups} />
      )}
    </>
  );
}

function IssueGroups({ groups }: { groups: MyIssueGroup[] }) {
  return (
    <>
      <ListRowHead columns={columns}>
        <span />
        <span>ID</span>
        <span>Title</span>
        <span>Project</span>
        <span>Labels</span>
        <span>Updated</span>
      </ListRowHead>
      <main
        aria-label="Issues assigned to you"
        className="tl-table-scroll">
        {groups.map((group, index) => (
          <IssueGroup
            key={group.status}
            group={group}
            next={groups[index + 1]?.status}
          />
        ))}
        <ListNote>Sorted by priority, then most recently updated.</ListNote>
      </main>
    </>
  );
}

function IssueGroup({ group, next }: { group: MyIssueGroup; next?: IssueStatus }) {
  const { name, kind } = statuses[group.status];
  return (
    <section aria-label={`${name}, ${issueCount(group.count)}`}>
      <CollapsibleListGroup
        id={groupId(group.status)}
        label={name}
        count={group.count}
        defaultExpanded={!collapsedStatuses.includes(group.status)}
        skipTo={next && { id: groupId(next), label: statuses[next].name }}
        icon={
          <span aria-hidden="true">
            <Status status={kind} />
          </span>
        }>
        {group.issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
          />
        ))}
      </CollapsibleListGroup>
    </section>
  );
}

function IssueRow({ issue }: { issue: MyIssue }) {
  const href = `/issue/${issue.id}`;
  const open = useRouterClick(href);
  const { name: priorityName, kind: priorityKind } = priorities[issue.priority];
  return (
    <ListRowLink
      columns={columns}
      href={href}
      label={`${issue.id}, ${issue.title}, ${priorityName}, ${issue.projectName}, updated ${formatExact(issue.updatedAt)}`}
      onClick={open}>
      <span
        className="tl-list-row__prio"
        title={priorityName}>
        {issue.priority !== "none" && <Priority priority={priorityKind} />}
      </span>
      <span className="tl-list-row__id">{issue.id}</span>
      <span
        className="tl-list-row__title"
        title={issue.title}>
        {issue.title}
      </span>
      <span
        className="tl-list-row__muted"
        title={issue.projectName}>
        {issue.projectName}
      </span>
      <LabelPills
        labels={issue.labels}
        className="tl-list-row__labels"
      />
      <UpdatedAt at={issue.updatedAt} />
    </ListRowLink>
  );
}