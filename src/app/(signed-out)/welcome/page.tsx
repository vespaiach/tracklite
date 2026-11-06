import { redirect } from "next/navigation";
import { setupNeeded } from "../../../queries";
import { checkSetupSecret, createFirstAdmin } from "./actions";
import { WelcomeForm } from "./WelcomeForm";

export default async function WelcomePage() {
  if (!(await setupNeeded())) redirect("/sign-in");

  return (
    <WelcomeForm
      checkSetupSecret={checkSetupSecret}
      createFirstAdmin={createFirstAdmin}
    />
  );
}