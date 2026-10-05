import { apiRoute } from "../../../../server/api-route";
import { profileResponse, updateMember } from "../../../../server/members";

export async function PATCH(request: Request, context: RouteContext<"/api/members/[username]">) {
  const { username } = await context.params;
  return apiRoute("admin", async (adminRequest) => {
    const body: Record<string, unknown> = await adminRequest.json();
    return Response.json(profileResponse(await updateMember(username, body)));
  })(request);
}