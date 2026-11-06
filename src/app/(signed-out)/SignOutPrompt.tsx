"use client";

import type { FormAction } from "../../contract";
import { Button, SignedOutLayout, SignedOutMessage } from "../../components/ui/track-lite";
import { useFormAction } from "../../components/useFormAction";

export function SignOutPrompt({ text, signOut }: { text: string; signOut: FormAction }) {
  const { submit, pending } = useFormAction(signOut, () => {});

  return (
    <SignedOutLayout>
      <SignedOutMessage text={text}>
        <form onSubmit={submit}>
          <Button
            type="submit"
            disabled={pending}>
            Sign out
          </Button>
        </form>
      </SignedOutMessage>
    </SignedOutLayout>
  );
}