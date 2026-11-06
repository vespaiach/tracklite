"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormAction } from "../../../contract";
import {
  Button,
  Field,
  Input,
  Mono,
  SignedOutFields,
  SignedOutForm,
  SignedOutHeading,
  SignedOutLayout,
  SignedOutMessage,
  SignedOutValue,
} from "../../../components/ui/track-lite";
import { useFormAction } from "../../../components/useFormAction";
import { useTokenOutOfAddress } from "../useTokenOutOfAddress";

type ProfileField = "fullName" | "username" | "password";

export function InvitationEnded({ message }: { message: string }) {
  const [title, ...rest] = message.split(/(?<=\.) /);
  return (
    <SignedOutLayout>
      <SignedOutMessage
        title={title}
        text={rest.join(" ")}
      />
    </SignedOutLayout>
  );
}

export function AcceptInvitationForm({
  token,
  email,
  acceptInvitation,
}: {
  token: string;
  email: string;
  acceptInvitation: FormAction;
}) {
  useTokenOutOfAddress();
  const router = useRouter();
  const [profile, setProfile] = useState<Record<ProfileField, string>>({
    fullName: "",
    username: "",
    password: "",
  });
  const { error, submit, pending } = useFormAction(acceptInvitation, () => router.replace("/my-issues"));

  if (error?.kind === "expired") return <InvitationEnded message={error.message} />;

  function edit(field: ProfileField) {
    return (event: { target: { value: string } }) => setProfile({ ...profile, [field]: event.target.value });
  }

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Join Tracklite">
          You're invited as {email}. Your username and email can't be changed later.
        </SignedOutHeading>
        <input
          type="hidden"
          name="token"
          value={token}
        />
        <SignedOutFields>
          <SignedOutValue label="Email">{email}</SignedOutValue>
          <Field
            label="Full name"
            error={error?.fields?.fullName}>
            {(props) => (
              <Input
                {...props}
                name="fullName"
                autoComplete="name"
                value={profile.fullName}
                onChange={edit("fullName")}
              />
            )}
          </Field>
          <Field
            label="Username"
            help={
              <>
                <Mono>2</Mono> to <Mono>20</Mono> lowercase letters, digits or hyphens. Used for @mentions.
              </>
            }
            error={error?.fields?.username}>
            {(props) => (
              <Input
                {...props}
                name="username"
                autoComplete="username"
                value={profile.username}
                onChange={edit("username")}
              />
            )}
          </Field>
          <Field
            label="Password"
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
                value={profile.password}
                onChange={edit("password")}
              />
            )}
          </Field>
        </SignedOutFields>
        <Button
          variant="primary"
          type="submit"
          block
          disabled={pending}
          aria-busy={pending || undefined}>
          {pending ? "Joining…" : "Join Tracklite"}
        </Button>
      </SignedOutForm>
    </SignedOutLayout>
  );
}