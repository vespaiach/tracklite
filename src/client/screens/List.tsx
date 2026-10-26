import { Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Key } from "react-aria-components";
import { useSearchParams } from "react-router";
import {
  Avatar,
  BoardEmpty,
  Button,
  FilterPicker,
  Filters,
  Input,
  ListRowHead,
  ListRowLink,
  ListSortButton,
  PickerItem,
  Priority,
  SettingsLayout,
  Status,
  type TableSort,
} from "../../components/ui/track-lite";
import {
  type ListIssue,
  type MemberSummary,
  type ProjectSummary,
  useIssueListInfiniteQuery,
  useLabelsQuery,
  useMeQuery,
  useMembersQuery,
} from "../api";
import { formatExact } from "../dates";
import { LabelPills, UpdatedAt } from "../IssueCells";
import { issuePriorities, issueStatuses } from "../../contract";
import { priorities, statuses } from "../issue-fields";
import { useRouterClick } from "../links";
import { LoadFailed, Loading } from "../LoadStates";
import { NewIssueDialog } from "../NewIssueDialog";
import { useShowLoading } from "../useShowLoading";

type SortColumn = "id" | "status" | "priority" | "updated";
type SortDir = "asc" | "desc";
type FilterParam = "status" | "assignee" | "priority" | "label";
type FilterOption = { key: string; name: string; icon?: ReactNode };

const filterParams: FilterParam[] = ["status", "assignee", "priority", "label"];
const filterNames: Record<FilterParam, string> = {
  status: "Status",
  assignee: "Assignee",
  priority: "Priority",
  label: "Label",
};
const firstDir: Record<SortColumn, SortDir> = { id: "desc", status: "asc", priority: "asc", updated: "desc" };
const columns = "64px minmax(240px, 1fr) 110px 100px minmax(0, 160px) 24px 110px";
const unassigned = "-";
const searchPause = 300;

function isSortColumn(value: string | null): value is SortColumn {
  return value !== null && value in firstDir;
}

function sameValue(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function memberName(member: MemberSummary) {
  return member.deactivated ? `${member.fullName} (deactivated)` : member.fullName;
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

function icon(content: ReactNode) {
  return <span aria-hidden="true">{content}</span>;
}

export function ListView({ project }: { project: ProjectSummary }) {
  const [params, setParams] = useSearchParams();
  const list = useIssueListInfiniteQuery({ key: project.key, query: params.toString() });
  const { data: me } = useMeQuery();
  const { data: members = [] } = useMembersQuery();
  const { data: projectLabels = [] } = useLabelsQuery(project.key);
  const showLoading = useShowLoading(list.isLoading);
  const [creating, setCreating] = useState(false);

  const pages = list.data?.pages ?? [];
  const issues = pages.flatMap((page) => page.issues);
  const deactivatedAssignees = pages[0]?.deactivatedAssignees ?? [];
  const archived = project.archivedAt !== null;
  const filtering = [...filterParams, "q"].some((name) => params.has(name));

  const options: Record<FilterParam, FilterOption[]> = {
    status: issueStatuses.map((key) => {
      const { name, kind } = statuses[key];
      return { key, name, icon: icon(<Status status={kind} />) };
    }),
    priority: issuePriorities.map((key) => {
      const { name, kind } = priorities[key];
      return { key, name, icon: icon(<Priority priority={kind} />) };
    }),
    assignee: [
      {
        key: unassigned,
        name: "Unassigned",
        icon: icon(
          <Avatar
            size="sm"
            empty
          />,
        ),
      },
      ...members
        .filter((member) => !member.deactivated)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((member) => ({
          key: member.username,
          name: member.fullName,
          icon: icon(<AssigneeAvatar initials={member.initials} />),
        })),
      ...deactivatedAssignees.map((member) => ({
        key: member.username,
        name: memberName(member),
        icon: icon(<AssigneeAvatar initials={member.initials} />),
      })),
    ],
    label: projectLabels.map((label) => ({ key: label.name, name: label.name })).sort(byName),
  };
  const knownAssignees = [
    ...options.assignee,
    ...members.map((member) => ({ key: member.username, name: memberName(member) })),
  ];

  function chosen(param: FilterParam) {
    const known = param === "assignee" ? knownAssignees : options[param];
    const found = params
      .getAll(param)
      .map((value) => known.find((option) => sameValue(option.key, value)))
      .filter((option) => option !== undefined);
    return found.filter((option, index) => found.findIndex((other) => other.key === option.key) === index);
  }

  function update(change: (next: URLSearchParams) => void, replace = false) {
    const next = new URLSearchParams(window.location.search);
    change(next);
    setParams(next, { replace });
  }

  function toggle(param: FilterParam, key: string) {
    update((next) => {
      const values = next.getAll(param);
      const kept = values.some((value) => sameValue(value, key))
        ? values.filter((value) => !sameValue(value, key))
        : [...values, key];
      next.delete(param);
      for (const value of kept) next.append(param, value);
    });
  }

  const sortColumn = isSortColumn(params.get("sort")) ? (params.get("sort") as SortColumn) : "updated";
  const dirParam = params.get("dir");
  const sortDir: SortDir =
    dirParam === "asc" || dirParam === "desc" ? dirParam : sortColumn === "updated" ? "desc" : "asc";

  function sortBy(column: SortColumn) {
    const dir = column === sortColumn ? (sortDir === "asc" ? "desc" : "asc") : firstDir[column];
    update((next) => {
      next.set("sort", column);
      next.set("dir", dir);
    });
  }

  function sortOf(column: SortColumn): TableSort {
    if (column !== sortColumn) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  const search = useSearch(params.get("q") ?? "", (q) =>
    update((next) => {
      if (q.trim()) next.set("q", q);
      else next.delete("q");
    }, true),
  );

  function clearAll() {
    search.reset();
    update((next) => {
      for (const name of [...filterParams, "q"]) next.delete(name);
    });
  }

  return (
    <>
      <Filters
        label="Filter issues"
        end={
          filtering && (
            <Button
              variant="quiet"
              size="sm"
              onClick={clearAll}>
              Clear filters
            </Button>
          )
        }>
        <Input
          type="search"
          compact
          icon={<Search size={13} />}
          aria-label="Search issues"
          placeholder="Search issues…"
          value={search.text}
          onChange={(event) => search.type(event.target.value)}
          className="tl-filters__search"
        />
        {filterParams.map((param) => {
          const selected = chosen(param);
          return (
            <FilterPicker
              key={param}
              field={filterNames[param]}
              values={selected.map((option) => option.name)}
              selectedKeys={selected.map((option) => option.key)}
              onToggle={(key: Key) => toggle(param, String(key))}
              onClear={() => update((next) => next.delete(param))}>
              {options[param].map((option) => (
                <PickerItem
                  key={option.key}
                  id={option.key}
                  textValue={option.name}>
                  {option.icon}
                  {option.name}
                </PickerItem>
              ))}
            </FilterPicker>
          );
        })}
      </Filters>
      {list.isError && !list.data ? (
        <LoadFailed onRetry={list.refetch} />
      ) : !list.data ? (
        <Loading show={showLoading} />
      ) : issues.length === 0 && !filtering ? (
        <SettingsLayout>
          {archived ? (
            <BoardEmpty>No issues.</BoardEmpty>
          ) : (
            <BoardEmpty
              action="Create one."
              onAction={() => setCreating(true)}>
              No issues yet.
            </BoardEmpty>
          )}
        </SettingsLayout>
      ) : (
        <>
          <ListRowHead
            columns={columns}
            label="Sort issues">
            <ListSortButton
              sort={sortOf("id")}
              onSort={() => sortBy("id")}>
              ID
            </ListSortButton>
            <span aria-hidden="true">Title</span>
            <ListSortButton
              sort={sortOf("status")}
              onSort={() => sortBy("status")}>
              Status
            </ListSortButton>
            <ListSortButton
              sort={sortOf("priority")}
              onSort={() => sortBy("priority")}>
              Priority
            </ListSortButton>
            <span aria-hidden="true">Labels</span>
            <span />
            <ListSortButton
              sort={sortOf("updated")}
              onSort={() => sortBy("updated")}>
              Last updated
            </ListSortButton>
          </ListRowHead>
          <main
            aria-label="Issues"
            className="tl-table-scroll">
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                mine={me !== undefined && issue.assignees[0]?.username === me.username}
              />
            ))}
            {issues.length === 0 && (
              <div className="tl-list-message">
                No issues match these filters
                <Button
                  size="sm"
                  onClick={clearAll}>
                  Clear filters
                </Button>
              </div>
            )}
            {list.hasNextPage && (
              <MoreRows
                loading={list.isFetchingNextPage}
                onVisible={() => void list.fetchNextPage()}
              />
            )}
          </main>
        </>
      )}
      {creating && (
        <NewIssueDialog
          project={project}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

function useSearch(committed: string, commit: (q: string) => void) {
  const [text, setText] = useState(committed);
  const [shown, setShown] = useState(committed);
  const written = useRef(committed);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  if (committed !== shown) {
    setShown(committed);
    if (committed !== written.current) setText(committed);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    text,
    type(value: string) {
      setText(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        written.current = value.trim() ? value : "";
        commit(value);
      }, searchPause);
    },
    reset() {
      clearTimeout(timer.current);
      written.current = "";
      setText("");
    },
  };
}

function AssigneeAvatar({ initials }: { initials: string }) {
  return (
    <Avatar
      size="sm"
      tone="neutral"
      initials={initials}
    />
  );
}

function IssueRow({ issue, mine }: { issue: ListIssue; mine: boolean }) {
  const href = `/issue/${issue.id}`;
  const open = useRouterClick(href);
  const { name: statusName, kind: statusKind } = statuses[issue.status];
  const { name: priorityName, kind: priorityKind } = priorities[issue.priority];
  const assigneeName = issue.assignees[0] ? memberName(issue.assignees[0]) : "Unassigned";
  return (
    <ListRowLink
      columns={columns}
      href={href}
      label={`${issue.id}, ${issue.title}, ${statusName}, ${priorityName}, ${assigneeName}, updated ${formatExact(issue.updatedAt)}`}
      onClick={open}>
      <span className="tl-list-row__id">{issue.id}</span>
      <span
        className="tl-list-row__title"
        title={issue.title}>
        {issue.title}
      </span>
      <span className="tl-list-row__cell">
        {icon(<Status status={statusKind} />)}
        <span>{statusName}</span>
      </span>
      <span className="tl-list-row__cell">
        {issue.priority === "none" ? (
          <span className="tl-list-row__muted">{priorityName}</span>
        ) : (
          <>
            {icon(<Priority priority={priorityKind} />)}
            <span>{priorityName}</span>
          </>
        )}
      </span>
      <LabelPills
        labels={issue.labels}
        className="tl-list-row__labels"
      />
      <Avatar
        size="md"
        empty={!issue.assignees[0]}
        tone={mine ? "accent" : "neutral"}
        initials={issue.assignees[0]?.initials}
        title={assigneeName}
      />
      <UpdatedAt at={issue.updatedAt} />
    </ListRowLink>
  );
}

function MoreRows({ loading, onVisible }: { loading: boolean; onVisible: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  const visible = useRef(onVisible);
  visible.current = onVisible;

  useEffect(() => {
    if (loading || !row.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) visible.current();
    });
    observer.observe(row.current);
    return () => observer.disconnect();
  }, [loading]);

  return (
    <div
      ref={row}
      aria-busy={loading}>
      {loading && (
        <p
          role="status"
          className="tl-list-note">
          Loading more…
        </p>
      )}
    </div>
  );
}