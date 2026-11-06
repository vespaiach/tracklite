import { generateKeyBetween } from "fractional-indexing";
import type { Actor } from "../identity/actor";
import type { MemberStanding } from "../identity/member-directory";
import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import type { RequestId, Username } from "../shared/identifiers";
import { IssuePriority } from "./issue-priority";
import type { IssueStatus } from "./issue-status";
import type { IssueTitle } from "./issue-title";

export type IssueProps = {
  id: string;
  projectId: string;
  number: number;
  requestId: string;
  title: IssueTitle;
  description: string;
  descriptionVersion: number;
  descriptionEditedBy: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  position: string;
  createdBy: string;
  assigneeIds: readonly string[];
  labelIds: readonly string[];
};

export type Neighbours = { before: string | null; after: string | null };

export type NewIssue = {
  projectId: string;
  number: number;
  requestId: RequestId;
  title: IssueTitle;
  status: IssueStatus;
  firstInColumn: string | null;
  assignees: Username[];
  candidates: MemberStanding[];
};

export function assigneeChange(current: readonly string[], next: readonly string[]) {
  return {
    added: next.filter((memberId) => !current.includes(memberId)),
    removed: current.filter((memberId) => !next.includes(memberId)),
  };
}

function sameLabels(current: readonly string[], next: readonly string[]) {
  return current.length === next.length && current.every((labelId) => next.includes(labelId));
}

export class Issue extends AggregateRoot {
  #props: Readonly<IssueProps>;

  private constructor(props: IssueProps) {
    super();
    this.#props = props;
  }

  get props() {
    return this.#props;
  }

  static rehydrate(props: IssueProps) {
    return new Issue(props);
  }

  static create(
    actor: Pick<Actor, "id">,
    { requestId, firstInColumn, assignees, candidates, ...fields }: NewIssue,
  ) {
    const issue = new Issue({
      ...fields,
      id: crypto.randomUUID(),
      requestId: requestId.value,
      description: "",
      descriptionVersion: 0,
      descriptionEditedBy: null,
      priority: IssuePriority.from("none"),
      position: generateKeyBetween(null, firstInColumn),
      createdBy: actor.id,
      assigneeIds: [],
      labelIds: [],
    });

    issue.assign(actor, assignees, candidates);
    return issue;
  }

  retitle(title: IssueTitle) {
    if (title.value === this.#props.title.value) return;
    this.#change({ title });
  }

  changeStatus(status: IssueStatus, firstInColumn: string | null) {
    if (status.value === this.#props.status.value) return;
    this.#change({ status, position: generateKeyBetween(null, firstInColumn) });
  }

  changePriority(priority: IssuePriority) {
    if (priority.value === this.#props.priority.value) return;
    this.#change({ priority });
  }

  move(status: IssueStatus, { before, after }: Neighbours) {
    this.#change({ status, position: generateKeyBetween(before, after) });
  }

  assign(actor: Pick<Actor, "id">, usernames: Username[], candidates: MemberStanding[]) {
    const assigneeIds = usernames.map((username) => this.#assigneeIdOf(username, candidates));

    const { added } = assigneeChange(this.#props.assigneeIds, assigneeIds);

    this.#change({ assigneeIds });
    if (added.length > 0) {
      this.record({ type: "IssueAssigned", actorId: actor.id, issueId: this.#props.id, assigneeIds: added });
    }
  }

  relabel(labelIds: string[], projectLabelIds: string[]) {
    if (projectLabelIds.length !== labelIds.length) {
      throw new DomainError("notFound", "That label no longer exists");
    }

    if (sameLabels(this.#props.labelIds, labelIds)) return;
    this.#change({ labelIds });
  }

  saveDescription(actor: Pick<Actor, "id">, description: string, descriptionVersion: number) {
    if (this.#props.descriptionVersion !== descriptionVersion) {
      return { conflictWith: this.#props.descriptionEditedBy };
    }

    this.#change({ description, descriptionVersion: descriptionVersion + 1, descriptionEditedBy: actor.id });
    this.record({
      type: "DescriptionSaved",
      actorId: actor.id,
      target: { issueId: this.#props.id },
      text: description,
    });
    return undefined;
  }

  assertDeletableBy(actor: Actor) {
    if (this.#props.createdBy !== actor.id && actor.role !== "admin") {
      throw new DomainError("forbidden", "You don't have permission to do that.");
    }
  }

  #assigneeIdOf(username: Username, candidates: MemberStanding[]) {
    const member = candidates.find((candidate) => candidate.username === username.value);
    if (!member || (member.deactivated && !this.#props.assigneeIds.includes(member.id))) {
      throw new DomainError("invalid", "Check the highlighted fields", {
        assignees: "Choose an active member",
      });
    }
    return member.id;
  }

  #change(fields: Partial<IssueProps>) {
    this.#props = { ...this.#props, ...fields };
  }
}