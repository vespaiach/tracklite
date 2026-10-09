import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useState } from "react";
import {
  Button as AriaButton,
  type DropItem,
  DropIndicator,
  type DropTarget,
  GridList,
  GridListItem,
  type Key,
  type TextDropItem,
  useDragAndDrop,
} from "react-aria-components";
import {
  Avatar,
  BoardCard,
  BoardColumn,
  BoardDrop,
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
import { issueStatuses } from "../../contract";
import { priorities, statuses } from "../issue-fields";
import { LoadFailed, Loading } from "../LoadStates";
import { useRouterClick } from "../links";
import { NewIssueDialog } from "../NewIssueDialog";
import { useShowLoading } from "../useShowLoading";

const labelsShown = 3;
const closedStatuses: IssueStatus[] = ["done", "canceled"];
const issueType = "application/x-tracklite-issue";

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

function draggedId(items: DropItem[]) {
  return (items[0] as TextDropItem).getText(issueType);
}

function placeAt(cards: BoardIssue[], id: string, target: DropTarget): BoardPlace {
  const others = cards.filter((card) => card.id !== id);
  const index = others.findIndex((card) => target.type === "item" && card.id === target.key);
  const above = target.type === "item" && target.dropPosition === "after" ? others[index] : others[index - 1];
  return above ? { after: above.id } : "top";
}

function StatusColumn({ column, archived, onCreate }: StatusColumnProps) {
  const { name, kind } = statuses[column.status];
  const [moveIssue] = useMoveIssueMutation();
  const move = (id: string, place: BoardPlace) => void moveIssue({ id, status: column.status, place });
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ [issueType]: String(key) })),
    acceptedDragTypes: [issueType],
    getDropOperation: () => "move",
    onReorder: ({ keys, target }) => {
      const id = String([...keys][0]);
      move(id, placeAt(column.cards, id, target));
    },
    onInsert: async ({ items, target }) => {
      const id = await draggedId(items);
      move(id, placeAt(column.cards, id, target));
    },
    onRootDrop: async ({ items }) => move(await draggedId(items), "top"),
    renderDropIndicator: (target) => (
      <DropIndicator
        target={target}
        className="tl-board-col__slot">
        {({ isDropTarget }) => isDropTarget && <BoardDrop />}
      </DropIndicator>
    ),
  });
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
      <GridList
        aria-label={name}
        items={column.cards}
        keyboardNavigationBehavior="tab"
        dragAndDropHooks={archived ? undefined : dragAndDropHooks}
        renderEmptyState={({ isDropTarget }) =>
          isDropTarget ? (
            <BoardDrop />
          ) : (
            <EmptyColumn
              status={column.status}
              archived={archived}
              onCreate={onCreate}
            />
          )
        }
        className="tl-board-col__list">
        {(card) => (
          <GridListItem
            id={card.id}
            textValue={card.title}>
            {({ isDragging }) => (
              <IssueCard
                card={card}
                status={column.status}
                first={card.id === column.cards[0].id}
                last={card.id === column.cards[column.cards.length - 1].id}
                archived={archived}
                dragging={isDragging}
              />
            )}
          </GridListItem>
        )}
      </GridList>
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
  dragging?: boolean;
};

function IssueCard({ card, status, first, last, archived, dragging }: IssueCardProps) {
  const href = `/issue/${card.id}`;
  const open = useRouterClick(href);
  const priorityKind = priorities[card.priority].kind;
  const hidden = card.labels.length - labelsShown;
  return (
    <BoardCard
      id={card.id}
      title={card.title}
      href={href}
      onOpen={open}
      dragging={dragging}
      handle={
        !archived && (
          <AriaButton
            slot="drag"
            className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
            <DotsSixVertical size={13} />
          </AriaButton>
        )
      }
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

  function move(key: Key) {
    const place: BoardPlace = key === "bottom" ? "bottom" : "top";
    const target = key === "top" || key === "bottom" ? status : (key as IssueStatus);
    void moveIssue({ id, status: target, place });
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
      onAction={move}>
      <MenuSubmenu label="Move to">
        {issueStatuses.map((key) => (
          <MenuItem
            key={key}
            id={key}
            icon={
              <span aria-hidden="true">
                <Status status={statuses[key].kind} />
              </span>
            }
            checked={key === status}
            disabled={key === status}>
            {statuses[key].name}
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