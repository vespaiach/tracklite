import { redirect } from "next/navigation";
import { setupNeeded } from "../../../queries";
import { pageMember } from "../../_server/session";
import { signIn } from "./actions";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await pageMember()) redirect("/my-issues");
  if (await setupNeeded()) redirect("/welcome");

  const { next } = await searchParams;
  return (
    <SignInForm
      next={typeof next === "string" ? next : null}
      signIn={signIn}
    />
  );
}