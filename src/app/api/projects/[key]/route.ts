import { deleteProject } from "../../../../application/projects/delete-project";
import { updateProject } from "../../../../application/projects/update-project";
import type { Project } from "../../../../contract";
import { ProjectKey, tryFrom } from "../../../../domain/shared/identifiers";
import { db } from "../../../../infrastructure/db";
import { projectWork } from "../../../../infrastructure/projects/project-work";
import { getProject, updatedProject } from "../../../../queries";
import { apiRoute } from "../../../../server/shared/api-route";
import { ProjectChanges } from "../../../_server/schemas/projects";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getProject(member, key)) satisfies Project),
  )(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", ProjectChanges, async (_memberRequest, member, changes) => {
    const projectId = await updateProject(member, projectWork, key, changes);
    return Response.json((await updatedProject(db, projectId)) satisfies Project);
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteProject(member, projectWork, key);
    return new Response(null, { status: 204 });
  })(request);
}