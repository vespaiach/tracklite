import type { Invitation } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { parseUuid } from "../../../../../server/shared/ids";
import { resendInvitation } from "../../../../../server/identity";

export async function POST(request: Request, { params }: RouteContext<"/api/invitations/[id]/resend">) {
  const id = parseUuid((await params).id);
  return apiRoute("member", async (_request, member) =>
    Response.json((await resendInvitation(member, id)) satisfies Invitation),
  )(request);
}