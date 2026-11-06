import type { ProjectKey } from "../shared/identifiers";

export interface ProjectRepository {
  writable(key: ProjectKey | undefined): Promise<{ id: string }>;
  labelIdsOf(projectId: string, labelIds: string[]): Promise<string[]>;
}