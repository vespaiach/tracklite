import { apiRoute } from "../../../../server/api-route";
import { deleteProject, getProject, updateProject } from "../../../../server/projects";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const { key } = await params;
  return apiRoute("member", async () => Response.json(await getProject(key)))(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const { key } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const body: Record<string, unknown> = await memberRequest.json();
    return Response.json(await updateProject(member, key, body));
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const { key } = await params;
  return apiRoute("admin", async () => {
    await deleteProject(key);
    return new Response(null, { status: 204 });
  })(request);
}