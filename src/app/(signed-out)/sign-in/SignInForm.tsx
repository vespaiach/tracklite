"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormAction } from "../../../contract";
import { Link } from "../../../components/leave-guard";
import {
  Button,
  Field,
  Input,
  SignedOutFields,
  SignedOutForm,
  SignedOutFormError,
  SignedOutHeading,
  SignedOutLayout,
} from "../../../components/ui/track-lite";
import { useFormAction } from "../../../components/useFormAction";
import { returnTarget } from "../../../lib/return-to";

export function SignInForm({ next, signIn }: { next: string | null; signIn: FormAction }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { error, submit, pending } = useFormAction(
    async (form) => {
      const result = await signIn(form);
      if (!result.ok) setPassword("");
      return result;
    },
    () => router.replace(returnTarget(next)),
  );

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Sign in" />
        <SignedOutFields>
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
          <Field
            label="Password"
            error={error?.fields?.password}>
            {(props) => (
              <Input
                {...props}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>
        </SignedOutFields>
        {error && !error.fields && <SignedOutFormError>{error.message}</SignedOutFormError>}
        <Button
          variant="primary"
          type="submit"
          block
          disabled={pending}
          aria-busy={pending || undefined}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <Link
          href="/forgot-password"
          className="tl-signed-out__link">
          Forgot password?
        </Link>
      </SignedOutForm>
    </SignedOutLayout>
  );
}