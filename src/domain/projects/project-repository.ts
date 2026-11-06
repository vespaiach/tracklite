import type { ProjectKey, Uuid } from "../shared/identifiers";
import type { Project } from "./project";

export interface ProjectRepository {
  get(key: ProjectKey | undefined): Promise<Project>;
  hold(key: ProjectKey | undefined): Promise<Project | undefined>;
  withLabel(labelId: Uuid | undefined): Promise<{ project: Project; labelId: string }>;
  labelIdsOf(projectId: string, labelIds: string[]): Promise<string[]>;
  save(project: Project): Promise<void>;
  remove(project: Project): Promise<void>;
}