import type { CommentRepository } from "../../domain/comments/comment-repository";
import type { Actor } from "../../domain/identity/actor";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { Uuid } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function deleteComment(
  actor: Actor,
  work: UnitOfWork<{ comments: CommentRepository; projects: ProjectRepository }>,
  id: Uuid | undefined,
) {
  await work.run(async ({ comments, projects }) => {
    (await projects.hold(await comments.projectKeyOf(id)))?.assertWritable();

    const comment = await comments.get(id);

    comment.assertDeletableBy(actor);

    await comments.remove(comment);
  });
}