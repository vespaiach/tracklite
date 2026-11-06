import { expect, it } from "vitest";
import { updateProject } from "../application/projects/update-project";
import { ProjectKey } from "../domain/shared/identifiers";
import { projectWork } from "../infrastructure/projects/project-work";
import { createMember, createProject } from "../test/factories";
import { listProjects } from "./project";

async function listedKeys(archived: boolean) {
  return (await listProjects(await createMember(), archived)).map((project) => project.key);
}

it("REQ-015.1: projects Website, API and Mobile are listed as API, Mobile, Website", async () => {
  const member = await createMember();
  const created = [
    await createProject({ name: "Website" }),
    await createProject({ name: "API" }),
    await createProject({ name: "Mobile" }),
  ];
  const keys = new Set<string>(created.map((project) => project.key));

  const listed = await listProjects(member, false);

  expect(listed.filter((project) => keys.has(project.key)).map((project) => project.name)).toEqual([
    "API",
    "Mobile",
    "Website",
  ]);
});

it("REQ-013.1, REQ-013.3: archiving moves a project from the sidebar list to the Archived list with its date; unarchiving moves it back", async () => {
  const admin = await createMember({ role: "admin" });
  const { key } = await createProject();

  await updateProject(admin, projectWork, ProjectKey.from(key), { archived: true });

  expect(await listedKeys(false)).not.toContain(key);
  const archived = await listProjects(admin, true);
  expect(archived.find((project) => project.key === key)).toMatchObject({ archivedAt: expect.any(String) });

  await updateProject(admin, projectWork, ProjectKey.from(key), { archived: false });

  expect(await listedKeys(false)).toContain(key);
  expect(await listedKeys(true)).not.toContain(key);
});