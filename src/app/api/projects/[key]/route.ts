import type { Project } from "../../../../client/api";
import { apiRoute } from "../../../../server/api-route";
import { ProjectChanges } from "../../../../schemas/project";
import { deleteProject, getProject, updateProject } from "../../../../server/projects";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const { key } = await params;
  return apiRoute("member", async () => Response.json((await getProject(key)) satisfies Project))(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const { key } = await params;
  return apiRoute("member", ProjectChanges, async (_memberRequest, member, changes) =>
    Response.json((await updateProject(member, key, changes)) satisfies Project),
  )(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const { key } = await params;
  return apiRoute("admin", async () => {
    await deleteProject(key);
    return new Response(null, { status: 204 });
  })(request);
}