"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormAction } from "../../../contract";
import { Link } from "../../../components/leave-guard";
import {
  Button,
  Field,
  Input,
  Mono,
  SignedOutForm,
  SignedOutHeading,
  SignedOutLayout,
  SignedOutMessage,
} from "../../../components/ui/track-lite";
import { useFormAction } from "../../../components/useFormAction";
import { useTokenOutOfAddress } from "../useTokenOutOfAddress";

export function ResetLinkExpired() {
  return (
    <SignedOutLayout>
      <SignedOutMessage
        title="This link has expired"
        text="Reset links work once and expire after 30 minutes.">
        <Link
          href="/forgot-password"
          className="tl-signed-out__link">
          Request a new link
        </Link>
      </SignedOutMessage>
    </SignedOutLayout>
  );
}

export function ResetPasswordForm({ token, resetPassword }: { token: string; resetPassword: FormAction }) {
  useTokenOutOfAddress();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const { error, submit, pending } = useFormAction(resetPassword, () => router.replace("/my-issues"));

  if (error?.kind === "expired") return <ResetLinkExpired />;

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Set a new password" />
        <input
          type="hidden"
          name="token"
          value={token}
        />
        <Field
          label="New password"
          help={
            <>
              <Mono>12</Mono> to <Mono>128</Mono> characters. Spaces count.
            </>
          }
          error={error?.fields?.password}>
          {(props) => (
            <Input
              {...props}
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Button
          variant="primary"
          type="submit"
          block
          busy={pending ? "Saving…" : undefined}
          aria-busy={pending || undefined}>
          Set password
        </Button>
      </SignedOutForm>
    </SignedOutLayout>
  );
}