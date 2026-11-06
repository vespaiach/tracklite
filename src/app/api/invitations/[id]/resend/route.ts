import type { Invitation } from "../../../../../contract";
import { tryFrom, Uuid } from "../../../../../domain/shared/identifiers";
import { apiRoute } from "../../../../../server/shared/api-route";
import { resendInvitation } from "../../../../../server/identity";

export async function POST(request: Request, { params }: RouteContext<"/api/invitations/[id]/resend">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_request, member) =>
    Response.json((await resendInvitation(member, id)) satisfies Invitation),
  )(request);
}