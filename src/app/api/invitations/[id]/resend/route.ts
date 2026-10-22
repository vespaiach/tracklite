import type { Invitation } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { resendInvitation } from "../../../../../server/identity";

export async function POST(request: Request, { params }: RouteContext<"/api/invitations/[id]/resend">) {
  const { id } = await params;
  return apiRoute("member", async (_request, member) =>
    Response.json((await resendInvitation(member, id)) satisfies Invitation),
  )(request);
}