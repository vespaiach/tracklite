import { reportClientError } from "../../../application/identity/report-client-error";
import { clientIp } from "../../../infrastructure/identity/limits";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { signedInMember } from "../../../infrastructure/identity/session";
import { apiRoute } from "../../../server/shared/api-route";
import { ClientErrorReport } from "../../_server/schemas/identity";

export const POST = apiRoute("public", ClientErrorReport, async (request, report, nameActor) => {
  const member = await signedInMember(request);
  if (member) nameActor(member.username);

  const sender = { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") ?? "" };
  await reportClientError(member, identityWork, report, sender);

  return new Response(null, { status: 204 });
});