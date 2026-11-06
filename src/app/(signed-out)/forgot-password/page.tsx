import { redirect } from "next/navigation";
import { pageMember } from "../../_server/session";
import { requestResetLink } from "./actions";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  if (await pageMember()) redirect("/my-issues");

  return <ForgotPasswordForm requestResetLink={requestResetLink} />;
}