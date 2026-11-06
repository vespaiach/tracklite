import { createFirstAdmin } from "../../../application/identity/create-first-admin";
import type { Me, SetupStatus } from "../../../contract";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { sessionCookie } from "../../../infrastructure/identity/session";
import { memberProfile, setupNeeded } from "../../../queries";
import { FirstAdmin } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("public", async () =>
  Response.json({ needed: await setupNeeded() } satisfies SetupStatus),
);

export const POST = apiRoute("public", FirstAdmin, async (_request, firstAdmin) => {
  const { username, sessionToken } = await createFirstAdmin(identityWork, firstAdmin);
  return Response.json((await memberProfile(username)) satisfies Me, {
    status: 201,
    headers: { "set-cookie": sessionCookie(sessionToken) },
  });
});