import type { ProjectKey, RequestId, Uuid } from "../shared/identifiers";
import type { Comment } from "./comment";

export interface CommentRepository {
  projectKeyOf(id: Uuid | undefined): Promise<ProjectKey>;
  get(id: Uuid | undefined): Promise<Comment>;
  idForRequest(requestId: RequestId): Promise<string | undefined>;
  save(comment: Comment): Promise<void>;
  remove(comment: Comment): Promise<void>;
}