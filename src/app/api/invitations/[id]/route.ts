import { apiRoute } from "../../../../server/shared/api-route";
import { parseUuid } from "../../../../server/shared/ids";
import { revokeInvitation } from "../../../../server/identity";

export async function DELETE(request: Request, { params }: RouteContext<"/api/invitations/[id]">) {
  const id = parseUuid((await params).id);
  return apiRoute("member", async (_request, member) => {
    await revokeInvitation(member, id);
    return new Response(null, { status: 204 });
  })(request);
}