import type { IssueId, RequestId } from "../shared/identifiers";
import type { Issue, Neighbours } from "./issue";
import type { IssueStatus } from "./issue-status";

export type Place = "top" | "bottom" | { after: IssueId | undefined };

export interface IssueRepository {
  get(id: IssueId | undefined): Promise<Issue>;
  idForRequest(requestId: RequestId): Promise<string | undefined>;
  nextNumber(projectId: string): Promise<number>;
  firstPositionIn(projectId: string, status: IssueStatus): Promise<string | null>;
  neighboursAt(issue: Issue, status: IssueStatus, place: Place): Promise<Neighbours>;
  save(issue: Issue): Promise<void>;
  remove(issue: Issue): Promise<void>;
}