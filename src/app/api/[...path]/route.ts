import { DomainError } from "../../../server/shared/domain-error";
import { apiRoute } from "../../../server/shared/api-route";

const notFound = apiRoute("member", () => {
  throw new DomainError("notFound", "Not found");
});

export { notFound as DELETE, notFound as GET, notFound as PATCH, notFound as POST, notFound as PUT };