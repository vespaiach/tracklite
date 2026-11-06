import type { CommentRepository } from "../../domain/comments/comment-repository";
import type { Actor } from "../../domain/identity/actor";
import type { MemberDirectory } from "../../domain/identity/member-directory";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import { editConflict } from "../../domain/shared/edit-conflict";
import type { Uuid } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

type Repositories = { comments: CommentRepository; projects: ProjectRepository; members: MemberDirectory };

export type CommentEditInput = { body: string; version: number };

export async function editComment(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  id: Uuid | undefined,
  { body, version }: CommentEditInput,
) {
  return work.run(async ({ comments, projects, members }) => {
    (await projects.hold(await comments.projectKeyOf(id)))?.assertWritable();

    const comment = await comments.get(id);

    const refused = comment.edit(actor, body, version);
    if (refused) throw editConflict(await members.fullNameOf(refused.conflictWith));

    await comments.save(comment);
    return comment.props.id;
  });
}