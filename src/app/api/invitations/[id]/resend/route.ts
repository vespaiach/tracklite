import { resendInvitation } from "../../../../../application/identity/resend-invitation";
import type { Invitation } from "../../../../../contract";
import { tryFrom, Uuid } from "../../../../../domain/shared/identifiers";
import { identityWork } from "../../../../../infrastructure/identity/repositories";
import { openInvitation } from "../../../../../queries";
import { apiRoute } from "../../../_route";

export async function POST(request: Request, { params }: RouteContext<"/api/invitations/[id]/resend">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_request, member) => {
    const resent = await resendInvitation(member, identityWork, id);
    return Response.json((await openInvitation(resent)) satisfies Invitation);
  })(request);
}