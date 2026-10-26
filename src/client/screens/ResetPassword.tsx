import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router";
import {
  Button,
  Field,
  Input,
  Mono,
  SignedOutForm,
  SignedOutHeading,
  SignedOutAlert,
  SignedOutLayout,
  SignedOutMessage,
  SignedOutStatus,
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  useLookUpResetLinkQuery,
  useMeQuery,
  useResetPasswordMutation,
  useSignOutMutation,
} from "../api";
import { showToast } from "../toast";
import { useShowLoading } from "../useShowLoading";
import { useTokenFromAddress } from "../useTokenFromAddress";

export function ResetPassword() {
  const token = useTokenFromAddress();
  const me = useMeQuery();
  const lookup = useLookUpResetLinkQuery({ token }, { skip: !me.isError });
  const [signOut, { isLoading: signingOut }] = useSignOutMutation();
  const [resetPassword, { isLoading: saving }] = useResetPasswordMutation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string>();
  const [expiredOnSubmit, setExpiredOnSubmit] = useState(false);
  const showLoading = useShowLoading(!me.isSuccess && !lookup.isSuccess && !lookup.isError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await resetPassword({ token, password }).unwrap();
      await navigate("/my-issues", { replace: true });
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.status === 410) {
        setExpiredOnSubmit(true);
      } else if (failure.fields?.password) {
        setPasswordError(failure.fields.password);
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  if (me.isSuccess) {
    return (
      <SignedOutLayout>
        <SignedOutMessage text={`You're signed in as ${me.data.fullName}. Sign out to reset a password.`}>
          <Button
            disabled={signingOut}
            onClick={() => signOut()}>
            Sign out
          </Button>
        </SignedOutMessage>
      </SignedOutLayout>
    );
  }

  const lookupFailure = lookup.error as ApiFailure | undefined;

  if (expiredOnSubmit || lookupFailure?.status === 410) {
    return (
      <SignedOutLayout>
        <SignedOutMessage
          title="This link has expired"
          text="Reset links work once and expire after 30 minutes.">
          <Link
            to="/forgot-password"
            className="tl-signed-out__link">
            Request a new link
          </Link>
        </SignedOutMessage>
      </SignedOutLayout>
    );
  }

  if (lookupFailure) {
    return (
      <SignedOutLayout>
        <SignedOutAlert text="Couldn’t load this.">
          <Button
            size="sm"
            onClick={() => lookup.refetch()}>
            Retry
          </Button>
        </SignedOutAlert>
      </SignedOutLayout>
    );
  }

  if (!lookup.isSuccess) {
    return (
      <SignedOutLayout>
        {showLoading && <SignedOutStatus>Checking your link…</SignedOutStatus>}
      </SignedOutLayout>
    );
  }

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Set a new password" />
        <Field
          label="New password"
          help={
            <>
              <Mono>12</Mono> to <Mono>128</Mono> characters. Spaces count.
            </>
          }
          error={passwordError}>
          {(props) => (
            <Input
              {...props}
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
          busy={saving ? "Saving…" : undefined}
          aria-busy={saving || undefined}>
          Set password
        </Button>
      </SignedOutForm>
    </SignedOutLayout>
  );
}