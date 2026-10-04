import { ApiError } from "../../../server/api-error";
import { apiRoute } from "../../../server/api-route";

const notFound = apiRoute("member", () => {
  throw new ApiError(404, "Not found");
});

export { notFound as DELETE, notFound as GET, notFound as PATCH, notFound as POST, notFound as PUT };