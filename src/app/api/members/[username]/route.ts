import type { Me } from "../../../../client/api";
import { MemberChanges } from "../../../../schemas/member";
import { apiRoute } from "../../../../server/api-route";
import { profileResponse, updateMember } from "../../../../server/members";

export async function PATCH(request: Request, { params }: RouteContext<"/api/members/[username]">) {
  const { username } = await params;
  return apiRoute("admin", MemberChanges, async (_adminRequest, _admin, changes) =>
    Response.json(profileResponse(await updateMember(username, changes)) satisfies Me),
  )(request);
}