import { ClientPage } from "../../../client/ClientPage";
import { createIssue } from "../project/[key]/actions";

export default function Page() {
  return <ClientPage createIssue={createIssue} />;
}