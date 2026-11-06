"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  startTransition,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Key } from "react-aria-components";
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
} from "../../../../../components/ui/track-lite";
import { formatExact } from "../../../../../client/dates";
import { Assignees, assignedTo, LabelPills, memberName, UpdatedAt } from "../../../../../client/IssueCells";
import { priorities, statuses } from "../../../../../client/issue-fields";
import {
  type IssueListPage,
  issuePriorities,
  issueStatuses,
  type Label,
  type ListIssue,
} from "../../../../../contract";
import { loadPage } from "../../../../../lib/load-page";
import { NewIssueDialog, type NewIssueProps } from "../NewIssueDialog";

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
const columns = "64px minmax(160px, 1fr) 96px 76px minmax(0, 160px) 72px 112px";
const unassigned = "-";
const searchPause = 300;

function isSortColumn(value: string | null): value is SortColumn {
  return value !== null && value in firstDir;
}

function sameValue(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

function icon(content: ReactNode) {
  return <span aria-hidden="true">{content}</span>;
}

export type MoreIssues = (more: { key: string; query: string; offset: number }) => Promise<IssueListPage>;

export type IssueListProps = Omit<NewIssueProps, "onCreated"> & {
  query: string;
  page: IssueListPage;
  labels: Label[];
  moreIssues: MoreIssues;
};

export function IssueList({ project, query, page, labels, moreIssues, ...newIssue }: IssueListProps) {
  const router = useRouter();
  const [shownQuery, showQuery] = useOptimistic(query);
  const params = new URLSearchParams(shownQuery);
  const more = useMorePages(project.key, query, page, moreIssues);
  const [creating, setCreating] = useState(false);
  const { members, me } = newIssue;

  const issues = [...page.issues, ...more.issues];
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
      ...page.deactivatedAssignees.map((member) => ({
        key: member.username,
        name: memberName(member),
        icon: icon(<AssigneeAvatar initials={member.initials} />),
      })),
    ],
    label: labels.map((label) => ({ key: label.name, name: label.name })).sort(byName),
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
    const next = new URLSearchParams(shownQuery);
    change(next);
    const search = next.toString();
    const address = `/project/${project.key}/list${search ? `?${search}` : ""}`;

    startTransition(() => {
      showQuery(search);
      if (replace) router.replace(address, { scroll: false });
      else router.push(address, { scroll: false });
    });
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
      {issues.length === 0 && !filtering ? (
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
                me={me}
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
            {more.hasMore && (
              <MoreRows
                loading={more.loading}
                onVisible={more.load}
              />
            )}
          </main>
        </>
      )}
      {creating && (
        <NewIssueDialog
          project={project}
          {...newIssue}
          onCreated={(id) => loadPage(`/issue/${id}`)}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

function useMorePages(key: string, query: string, page: IssueListPage, moreIssues: MoreIssues) {
  const [loaded, setLoaded] = useState({ query, issues: [] as ListIssue[], hasMore: page.hasMore });
  const [loading, startLoading] = useTransition();
  const current = loaded.query === query ? loaded : { query, issues: [], hasMore: page.hasMore };

  function load() {
    startLoading(async () => {
      const offset = page.issues.length + current.issues.length;
      const { issues, hasMore } = await moreIssues({ key, query, offset });
      startTransition(() => setLoaded({ query, issues: [...current.issues, ...issues], hasMore }));
    });
  }

  return { issues: current.issues, hasMore: current.hasMore, loading, load };
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

function IssueRow({ issue, me }: { issue: ListIssue; me?: string }) {
  const href = `/issue/${issue.id}`;
  const { name: statusName, kind: statusKind } = statuses[issue.status];
  const { name: priorityName, kind: priorityKind } = priorities[issue.priority];
  return (
    <ListRowLink
      columns={columns}
      href={href}
      label={`${issue.id}, ${issue.title}, ${statusName}, ${priorityName}, ${assignedTo(issue.assignees)}, updated ${formatExact(issue.updatedAt)}`}>
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
      <Assignees
        assignees={issue.assignees}
        me={me}
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