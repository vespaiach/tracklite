import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, Navigate } from "react-router";
import {
  Button,
  Field,
  Input,
  SignedOutForm,
  SignedOutFormError,
  SignedOutHeading,
  SignedOutLayout,
} from "../../components/ui/track-lite";
import { type ApiFailure, useMeQuery, useRequestResetLinkMutation } from "../api";
import { showToast } from "../toast";

const backToSignIn = (
  <Link
    to="/sign-in"
    className="tl-signed-out__link">
    Back to sign in
  </Link>
);

export function ForgotPassword() {
  const me = useMeQuery();
  const [requestResetLink, { isLoading: sending }] = useRequestResetLinkMutation();
  const dispatch = useDispatch();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const [formError, setFormError] = useState<string>();

  if (me.isSuccess) {
    return (
      <Navigate
        to="/my-issues"
        replace
      />
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    try {
      await requestResetLink({ email }).unwrap();
      setSentTo(email);
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.status === 429) {
        setFormError(failure.message);
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  if (sentTo !== undefined) {
    return (
      <SignedOutLayout>
        <SignedOutHeading title="Check your email">
          If {sentTo} belongs to a Tracklite member, a reset link is on its way. The link works once and
          expires after 30 minutes.
        </SignedOutHeading>
        {backToSignIn}
      </SignedOutLayout>
    );
  }

  return (
    <SignedOutLayout>
      {me.isError && (
        <SignedOutForm onSubmit={submit}>
          <SignedOutHeading title="Reset your password">
            Enter the email you sign in with. You'll get a link to set a new password.
          </SignedOutHeading>
          <Field label="Email">
            {(props) => (
              <Input
                {...props}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          {formError && <SignedOutFormError>{formError}</SignedOutFormError>}
          <Button
            variant="primary"
            type="submit"
            block
            disabled={sending}
            aria-busy={sending || undefined}>
            {sending ? "Sending…" : "Send link"}
          </Button>
          {backToSignIn}
        </SignedOutForm>
      )}
    </SignedOutLayout>
  );
}