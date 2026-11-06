"use client";

import { useState } from "react";
import type { FormAction } from "../../../contract";
import { Link } from "../../../components/leave-guard";
import {
  Button,
  Field,
  Input,
  Mono,
  SignedOutForm,
  SignedOutFormError,
  SignedOutHeading,
  SignedOutLayout,
} from "../../../components/ui/track-lite";
import { useFormAction } from "../../../components/useFormAction";

const backToSignIn = (
  <Link
    href="/sign-in"
    className="tl-signed-out__link">
    Back to sign in
  </Link>
);

export function ForgotPasswordForm({ requestResetLink }: { requestResetLink: FormAction }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const { error, submit, pending } = useFormAction(requestResetLink, () => setSentTo(email));

  if (sentTo !== undefined) {
    return (
      <SignedOutLayout>
        <SignedOutHeading title="Check your email">
          If {sentTo} belongs to a Tracklite member, a reset link is on its way. The link works once and
          expires after <Mono>30</Mono> minutes.
        </SignedOutHeading>
        {backToSignIn}
      </SignedOutLayout>
    );
  }

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Reset your password">
          Enter the email you sign in with. You'll get a link to set a new password.
        </SignedOutHeading>
        <Field
          label="Email"
          error={error?.fields?.email}>
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        {error && !error.fields && <SignedOutFormError>{error.message}</SignedOutFormError>}
        <Button
          variant="primary"
          type="submit"
          block
          disabled={pending}
          aria-busy={pending || undefined}>
          {pending ? "Sending…" : "Send link"}
        </Button>
        {backToSignIn}
      </SignedOutForm>
    </SignedOutLayout>
  );
}