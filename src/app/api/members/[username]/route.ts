import type { Me } from "../../../../client/api";
import { apiRoute } from "../../../../server/api-route";
import { profileResponse, updateMember } from "../../../../server/members";

export async function PATCH(request: Request, { params }: RouteContext<"/api/members/[username]">) {
  const { username } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const body: Record<string, unknown> = await memberRequest.json();
    return Response.json(profileResponse(await updateMember(member, username, body)) satisfies Me);
  })(request);
}