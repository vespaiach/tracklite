import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useState } from "react";
import type { Key } from "react-aria-components";
import { useDispatch } from "react-redux";
import {
  Avatar,
  BoardCard,
  BoardColumn,
  BoardEmpty,
  Board as BoardLayout,
  Button,
  Menu,
  MenuItem,
  MenuSubmenu,
  Pill,
  Priority,
  Status,
} from "../../components/ui/track-lite";
import {
  type BoardIssue,
  type BoardPlace,
  type BoardStatusColumn,
  type IssueStatus,
  type ProjectSummary,
  useBoardQuery,
  useMoveIssueMutation,
} from "../api";
import { priorities, statuses } from "../issue-fields";
import { LoadFailed, Loading } from "../LoadStates";
import { useRouterClick } from "../links";
import { NewIssueDialog } from "../NewIssueDialog";
import { showToast } from "../toast";
import { useShowLoading } from "../useShowLoading";

const labelsShown = 3;
const closedStatuses: IssueStatus[] = ["done", "canceled"];

function statusInfo(status: IssueStatus) {
  return statuses.find(([key]) => key === status) ?? statuses[0];
}

export function BoardView({ project }: { project: ProjectSummary }) {
  const query = useBoardQuery(project.key);
  const showLoading = useShowLoading(query.isLoading);
  const [creatingIn, setCreatingIn] = useState<IssueStatus>();
  if (query.isError) return <LoadFailed onRetry={query.refetch} />;
  if (!query.data) return <Loading show={showLoading} />;
  const archived = project.archivedAt !== null;
  return (
    <>
      <BoardLayout>
        {query.data.map((column) => (
          <StatusColumn
            key={column.status}
            column={column}
            archived={archived}
            onCreate={() => setCreatingIn(column.status)}
          />
        ))}
      </BoardLayout>
      {creatingIn && (
        <NewIssueDialog
          project={project}
          status={creatingIn}
          onClose={() => setCreatingIn(undefined)}
        />
      )}
    </>
  );
}

type StatusColumnProps = { column: BoardStatusColumn; archived: boolean; onCreate: () => void };

function StatusColumn({ column, archived, onCreate }: StatusColumnProps) {
  const [, name, kind] = statusInfo(column.status);
  return (
    <BoardColumn
      label={name}
      count={column.count}
      icon={
        <span aria-hidden="true">
          <Status status={kind} />
        </span>
      }
      action={
        !archived && (
          <Button
            variant="quiet"
            size="sm"
            icon
            aria-label={`New issue in ${name}`}
            onClick={onCreate}>
            <Plus size={12} />
          </Button>
        )
      }>
      {column.cards.length === 0 ? (
        <EmptyColumn
          status={column.status}
          archived={archived}
          onCreate={onCreate}
        />
      ) : (
        <ul className="tl-board-col__list">
          {column.cards.map((card, index) => (
            <li key={card.id}>
              <IssueCard
                card={card}
                status={column.status}
                first={index === 0}
                last={index === column.cards.length - 1}
                archived={archived}
              />
            </li>
          ))}
        </ul>
      )}
    </BoardColumn>
  );
}

type EmptyColumnProps = { status: IssueStatus; archived: boolean; onCreate: () => void };

function EmptyColumn({ status, archived, onCreate }: EmptyColumnProps) {
  if (closedStatuses.includes(status))
    return <BoardEmpty>Nothing moved here in the last 14 days.</BoardEmpty>;
  if (archived) return <BoardEmpty>No issues.</BoardEmpty>;
  return (
    <BoardEmpty
      action="Create one."
      onAction={onCreate}>
      No issues yet.
    </BoardEmpty>
  );
}

type IssueCardProps = {
  card: BoardIssue;
  status: IssueStatus;
  first: boolean;
  last: boolean;
  archived: boolean;
};

function IssueCard({ card, status, first, last, archived }: IssueCardProps) {
  const href = `/issue/${card.id}`;
  const open = useRouterClick(href);
  const [, , priorityKind] = priorities.find(([key]) => key === card.priority) ?? priorities[0];
  const hidden = card.labels.length - labelsShown;
  return (
    <BoardCard
      id={card.id}
      title={card.title}
      href={href}
      onOpen={open}
      priority={card.priority !== "none" && <Priority priority={priorityKind} />}
      assignee={
        card.assignee && (
          <Avatar
            size="sm"
            initials={card.assignee.initials}
            title={card.assignee.fullName}
          />
        )
      }
      foot={
        card.labels.length > 0 && (
          <>
            {card.labels.slice(0, labelsShown).map((label) => (
              <Pill
                key={label.id}
                kind="label">
                {label.name}
              </Pill>
            ))}
            {hidden > 0 && <Pill kind="est">{`+${hidden}`}</Pill>}
          </>
        )
      }
      menu={
        !archived && (
          <MoveMenu
            id={card.id}
            status={status}
            first={first}
            last={last}
          />
        )
      }
    />
  );
}

type MoveMenuProps = { id: string; status: IssueStatus; first: boolean; last: boolean };

function MoveMenu({ id, status, first, last }: MoveMenuProps) {
  const [moveIssue] = useMoveIssueMutation();
  const dispatch = useDispatch();

  async function move(key: Key) {
    const place: BoardPlace = key === "bottom" ? "bottom" : "top";
    const target = key === "top" || key === "bottom" ? status : (key as IssueStatus);
    try {
      await moveIssue({ id, status: target, place }).unwrap();
    } catch {
      dispatch(showToast(`Couldn't move ${id}`));
    }
  }

  return (
    <Menu
      label={`${id} actions`}
      icon={
        <DotsThree
          size={15}
          weight="bold"
        />
      }
      onAction={(key) => void move(key)}>
      <MenuSubmenu label="Move to">
        {statuses.map(([key, name, kind]) => (
          <MenuItem
            key={key}
            id={key}
            icon={
              <span aria-hidden="true">
                <Status status={kind} />
              </span>
            }
            checked={key === status}
            disabled={key === status}>
            {name}
          </MenuItem>
        ))}
      </MenuSubmenu>
      <MenuItem
        id="top"
        disabled={first}>
        Move to top
      </MenuItem>
      <MenuItem
        id="bottom"
        disabled={last}>
        Move to bottom
      </MenuItem>
    </Menu>
  );
}