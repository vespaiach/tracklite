import type { Actor } from "../identity/actor";
import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import type { EventTarget } from "../shared/events";
import type { RequestId } from "../shared/identifiers";

export type CommentProps = {
  id: string;
  target: EventTarget;
  authorId: string;
  body: string;
  version: number;
  requestId: string;
};

export type NewComment = { target: EventTarget; body: string; requestId: RequestId };

export function commentGone() {
  return new DomainError("notFound", "This comment was deleted");
}

function notAllowed() {
  return new DomainError("forbidden", "You don't have permission to do that.");
}

export function parentOf(comment: { issueId: string | null; projectId: string | null }): EventTarget {
  return comment.issueId ? { issueId: comment.issueId } : { projectId: comment.projectId as string };
}

export class Comment extends AggregateRoot {
  #props: Readonly<CommentProps>;

  private constructor(props: CommentProps) {
    super();
    this.#props = props;
  }

  get props() {
    return this.#props;
  }

  static rehydrate(props: CommentProps) {
    return new Comment(props);
  }

  static create(actor: Pick<Actor, "id">, { target, body, requestId }: NewComment) {
    const comment = new Comment({
      id: crypto.randomUUID(),
      target,
      authorId: actor.id,
      body,
      version: 0,
      requestId: requestId.value,
    });

    comment.record({
      type: "CommentPosted",
      actorId: actor.id,
      target,
      commentId: comment.#props.id,
      text: body,
    });
    return comment;
  }

  edit(actor: Pick<Actor, "id">, body: string, version: number) {
    if (this.#props.authorId !== actor.id) throw notAllowed();
    if (this.#props.version !== version) return { conflictWith: this.#props.authorId };

    this.#props = { ...this.#props, body, version: version + 1 };
    this.record({
      type: "CommentEdited",
      actorId: actor.id,
      target: this.#props.target,
      commentId: this.#props.id,
      text: body,
    });
    return undefined;
  }

  assertDeletableBy(actor: Actor) {
    if (this.#props.authorId !== actor.id && actor.role !== "admin") throw notAllowed();
  }
}