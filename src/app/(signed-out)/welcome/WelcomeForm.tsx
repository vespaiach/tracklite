"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { ActionError, FormAction } from "../../../contract";
import {
  Button,
  Field,
  Input,
  Mono,
  SignedOutFields,
  SignedOutForm,
  SignedOutFormError,
  SignedOutHeading,
  SignedOutLayout,
} from "../../../components/ui/track-lite";
import { useFormAction } from "../../../components/useFormAction";

type ProfileField = "email" | "fullName" | "username" | "password" | "confirmPassword";

const passwordsDiffer = "Passwords don’t match";

const everyRefusal: ActionError["kind"][] = [
  "signedOut",
  "forbidden",
  "notFound",
  "conflict",
  "expired",
  "invalid",
  "limited",
  "unavailable",
];

export function WelcomeForm({
  checkSetupSecret,
  createFirstAdmin,
}: {
  checkSetupSecret: FormAction;
  createFirstAdmin: FormAction;
}) {
  const [secret, setSecret] = useState<string>();

  return (
    <SignedOutLayout>
      {secret === undefined ? (
        <SecretStep
          checkSetupSecret={checkSetupSecret}
          onAccepted={setSecret}
        />
      ) : (
        <ProfileStep
          secret={secret}
          createFirstAdmin={createFirstAdmin}
        />
      )}
    </SignedOutLayout>
  );
}

function SecretStep({
  checkSetupSecret,
  onAccepted,
}: {
  checkSetupSecret: FormAction;
  onAccepted: (secret: string) => void;
}) {
  const [secret, setSecret] = useState("");
  const { error, submit, pending } = useFormAction(checkSetupSecret, () => onAccepted(secret), everyRefusal);

  return (
    <SignedOutForm onSubmit={submit}>
      <SignedOutHeading title="Welcome to Tracklite">
        Enter the setup secret from the server's config to create the first admin.
      </SignedOutHeading>
      <SignedOutFields>
        <Field label="Setup secret">
          {(props) => (
            <Input
              {...props}
              name="secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          )}
        </Field>
      </SignedOutFields>
      {error && <SignedOutFormError>{error.fields?.secret ?? error.message}</SignedOutFormError>}
      <Button
        variant="primary"
        type="submit"
        block
        disabled={pending}
        aria-busy={pending || undefined}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </SignedOutForm>
  );
}

function ProfileStep({ secret, createFirstAdmin }: { secret: string; createFirstAdmin: FormAction }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Record<ProfileField, string>>({
    email: "",
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [mismatch, setMismatch] = useState(false);
  const { error, submit, pending } = useFormAction(
    createFirstAdmin,
    () => router.replace("/my-issues"),
    everyRefusal,
  );
  const fieldErrors: Partial<Record<ProfileField, string>> = mismatch
    ? { confirmPassword: passwordsDiffer }
    : (error?.fields ?? {});

  function create(event: FormEvent<HTMLFormElement>) {
    const differ = profile.confirmPassword !== profile.password;
    setMismatch(differ);
    if (differ) event.preventDefault();
    else submit(event);
  }

  function edit(field: ProfileField) {
    return (event: { target: { value: string } }) => setProfile({ ...profile, [field]: event.target.value });
  }

  return (
    <SignedOutForm onSubmit={create}>
      <SignedOutHeading title="Create the first admin">
        Your username and email can't be changed later.
      </SignedOutHeading>
      <input
        type="hidden"
        name="secret"
        value={secret}
      />
      <SignedOutFields>
        <Field
          label="Email"
          error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              autoComplete="email"
              value={profile.email}
              onChange={edit("email")}
            />
          )}
        </Field>
        <Field
          label="Full name"
          error={fieldErrors.fullName}>
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
          error={fieldErrors.username}>
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
          error={fieldErrors.password}>
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
        <Field
          label="Confirm password"
          error={fieldErrors.confirmPassword}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={profile.confirmPassword}
              onChange={edit("confirmPassword")}
            />
          )}
        </Field>
      </SignedOutFields>
      {error && !error.fields && !mismatch && <SignedOutFormError>{error.message}</SignedOutFormError>}
      <Button
        variant="primary"
        type="submit"
        block
        disabled={pending}
        aria-busy={pending || undefined}>
        {pending ? "Creating…" : "Create admin"}
      </Button>
    </SignedOutForm>
  );
}