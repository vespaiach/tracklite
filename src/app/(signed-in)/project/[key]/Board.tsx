"use client";

import { GripVertical, Ellipsis, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useState } from "react";
import {
  Button as AriaButton,
  type DropItem,
  DropIndicator,
  type DropTarget,
  GridList,
  GridListItem,
  type Key,
  ListLayout,
  type ListLayoutOptions,
  type TextDropItem,
  useDragAndDrop,
  Virtualizer,
} from "react-aria-components";
import { assignedTo } from "../../../../client/IssueCells";
import { priorities, statuses } from "../../../../client/issue-fields";
import { useToast } from "../../../../components/toast";
import {
  AvatarStack,
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
} from "../../../../components/ui/track-lite";
import {
  type ActionResult,
  type Board as BoardColumns,
  type BoardIssue,
  type BoardMove,
  type BoardPlace,
  type BoardStatusColumn,
  type IssueStatus,
  issueStatuses,
} from "../../../../contract";
import { loadPage } from "../../../../lib/load-page";
import { NewIssueDialog, type NewIssueProps } from "./NewIssueDialog";

const labelsShown = 3;
const closedStatuses: IssueStatus[] = ["done", "canceled"];
const issueType = "application/x-tracklite-issue";
const cardLayout: ListLayoutOptions = { estimatedRowSize: 80, gap: 8, padding: 4, dropIndicatorThickness: 8 };

export type MoveIssue = (move: BoardMove) => Promise<ActionResult<null>>;

export type BoardProps = Omit<NewIssueProps, "onCreated"> & { columns: BoardColumns; moveIssue: MoveIssue };

type Move = (id: string, status: IssueStatus, place: BoardPlace) => void;

export function Board({ project, columns, moveIssue, ...newIssue }: BoardProps) {
  const [shown, showMoved] = useOptimistic(columns, placed);
  const [creatingIn, setCreatingIn] = useState<IssueStatus>();
  const toast = useToast();
  const router = useRouter();
  const archived = project.archivedAt !== null;

  function move(id: string, status: IssueStatus, place: BoardPlace) {
    startTransition(async () => {
      showMoved({ id, status, place });
      const result = await moveIssue({ id, status, place }).catch(() => undefined);
      if (result?.ok) return;

      toast(result ? result.error.message : `Couldn’t move ${id}`);
      if (result?.error.kind === "notFound") router.refresh();
    });
  }

  return (
    <>
      <BoardLayout>
        {shown.map((column) => (
          <StatusColumn
            key={column.status}
            column={column}
            archived={archived}
            me={newIssue.me}
            onMove={move}
            onCreate={() => setCreatingIn(column.status)}
          />
        ))}
      </BoardLayout>
      {creatingIn && (
        <NewIssueDialog
          project={project}
          {...newIssue}
          status={creatingIn}
          onCreated={(id) => loadPage(`/issue/${id}`)}
          onClose={() => setCreatingIn(undefined)}
        />
      )}
    </>
  );
}

function placed(board: BoardColumns, { id, status, place }: BoardMove): BoardColumns {
  const card = board.flatMap((column) => column.cards).find((each) => each.id === id);
  if (!card) return board;

  return board.map((column) => {
    const cards = column.cards.filter((each) => each.id !== id);
    if (column.status === status) cards.splice(insertionIndex(cards, place), 0, card);
    return { ...column, count: column.count + cards.length - column.cards.length, cards };
  });
}

function insertionIndex(cards: BoardIssue[], place: BoardPlace) {
  if (place === "bottom") return cards.length;
  if (place === "top") return 0;
  return cards.findIndex((each) => each.id === place.after) + 1;
}

type StatusColumnProps = {
  column: BoardStatusColumn;
  archived: boolean;
  me: string;
  onMove: Move;
  onCreate: () => void;
};

function draggedId(items: DropItem[]) {
  return (items[0] as TextDropItem).getText(issueType);
}

function placeAt(cards: BoardIssue[], id: string, target: DropTarget): BoardPlace {
  const others = cards.filter((card) => card.id !== id);
  const index = others.findIndex((card) => target.type === "item" && card.id === target.key);
  const above = target.type === "item" && target.dropPosition === "after" ? others[index] : others[index - 1];
  return above ? { after: above.id } : "top";
}

function StatusColumn({ column, archived, me, onMove, onCreate }: StatusColumnProps) {
  const { name, kind } = statuses[column.status];
  const closed = closedStatuses.includes(column.status);
  const move = (id: string, place: BoardPlace) => onMove(id, column.status, place);
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
        !archived &&
        !closed && (
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
      <Virtualizer
        layout={ListLayout}
        layoutOptions={cardLayout}>
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
                  me={me}
                  onMove={onMove}
                />
              )}
            </GridListItem>
          )}
        </GridList>
      </Virtualizer>
    </BoardColumn>
  );
}

type EmptyColumnProps = { status: IssueStatus; archived: boolean; onCreate: () => void };

function EmptyColumn({ status, archived, onCreate }: EmptyColumnProps) {
  if (archived) return <BoardEmpty>No issues.</BoardEmpty>;
  if (closedStatuses.includes(status))
    return <BoardEmpty>Nothing moved here in the last 14 days.</BoardEmpty>;
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
  me: string;
  onMove: Move;
};

function IssueCard({ card, status, first, last, archived, dragging, me, onMove }: IssueCardProps) {
  const priorityKind = priorities[card.priority].kind;
  const hiddenLabels = card.labels.slice(labelsShown);
  return (
    <BoardCard
      id={card.id}
      title={card.title}
      label={`${card.title}, ${assignedTo(card.assignees)}`}
      href={`/issue/${card.id}`}
      closed={closedStatuses.includes(status)}
      dragging={dragging}
      handle={
        !archived && (
          <AriaButton
            slot="drag"
            className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
            <GripVertical size={13} />
          </AriaButton>
        )
      }
      priority={card.priority !== "none" && <Priority priority={priorityKind} />}
      assignee={
        card.assignees.length > 0 && (
          <AvatarStack
            members={card.assignees}
            me={me}
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
            {hiddenLabels.length > 0 && (
              <Pill
                kind="est"
                title={hiddenLabels.map((label) => label.name).join(", ")}>
                {`+${hiddenLabels.length}`}
              </Pill>
            )}
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
            onMove={onMove}
          />
        )
      }
    />
  );
}

type MoveMenuProps = { id: string; status: IssueStatus; first: boolean; last: boolean; onMove: Move };

function MoveMenu({ id, status, first, last, onMove }: MoveMenuProps) {
  function move(key: Key) {
    const place: BoardPlace = key === "bottom" ? "bottom" : "top";
    const target = key === "top" || key === "bottom" ? status : (key as IssueStatus);
    onMove(id, target, place);
  }

  return (
    <Menu
      label={`Actions for ${id}`}
      icon={<Ellipsis size={15} />}
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