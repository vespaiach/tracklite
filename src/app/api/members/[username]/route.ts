import type { Me } from "../../../../client/api";
import { apiRoute } from "../../../../server/api-route";
import { profileResponse, updateMember } from "../../../../server/members";

export async function PATCH(request: Request, { params }: RouteContext<"/api/members/[username]">) {
  const { username } = await params;
  return apiRoute("admin", async (adminRequest) => {
    const body: Record<string, unknown> = await adminRequest.json();
    return Response.json(profileResponse(await updateMember(username, body)) satisfies Me);
  })(request);
}