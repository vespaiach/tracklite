import type { Me } from "../../../../contract";
import { tryFrom, Username } from "../../../../domain/shared/identifiers";
import { apiRoute } from "../../../../server/shared/api-route";
import { MemberChanges, profileResponse, updateMember } from "../../../../server/identity";

export async function PATCH(request: Request, { params }: RouteContext<"/api/members/[username]">) {
  const username = tryFrom(Username, (await params).username);
  return apiRoute("member", MemberChanges, async (_memberRequest, member, changes) =>
    Response.json(profileResponse(await updateMember(member, username, changes)) satisfies Me),
  )(request);
}