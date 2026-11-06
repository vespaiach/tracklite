import { Comment } from "../../domain/comments/comment";
import type { CommentRepository } from "../../domain/comments/comment-repository";
import type { Actor } from "../../domain/identity/actor";
import type { IssueRepository } from "../../domain/issues/issue-repository";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import { DomainError } from "../../domain/shared/domain-error";
import type { EventTarget } from "../../domain/shared/events";
import type { IssueId, ProjectKey, RequestId } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

type Repositories = { comments: CommentRepository; issues: IssueRepository; projects: ProjectRepository };

export type NewCommentInput = { requestId: RequestId; body: string };

async function postComment(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  { requestId, body }: NewCommentInput,
  targetOf: (repositories: Repositories) => Promise<EventTarget>,
) {
  return work.run(async (repositories) => {
    const target = await targetOf(repositories);

    const repeatedId = await repositories.comments.idForRequest(requestId);
    if (repeatedId) return { commentId: repeatedId, created: false };

    const comment = Comment.create(actor, { target, body, requestId });

    await repositories.comments.save(comment);
    return { commentId: comment.props.id, created: true };
  });
}

export function postIssueComment(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  id: IssueId | undefined,
  input: NewCommentInput,
) {
  return postComment(actor, work, input, async ({ issues, projects }) => {
    (await projects.hold(id?.key))?.assertWritable();

    return { issueId: (await issues.get(id)).props.id };
  });
}

export function postProjectComment(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  key: ProjectKey | undefined,
  input: NewCommentInput,
) {
  return postComment(actor, work, input, async ({ projects }) => {
    const project = await projects.hold(key);
    if (!project) throw new DomainError("notFound", "Not found");
    project.assertWritable();

    return { projectId: project.props.id };
  });
}