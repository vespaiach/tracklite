import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  Button,
  Field,
  Input,
  SignedOutFields,
  SignedOutForm,
  SignedOutFormError,
  SignedOutHeading,
  SignedOutLayout,
} from "../../components/ui/track-lite";
import { type ApiFailure, useMeQuery, useSignInMutation } from "../api";
import { returnTarget } from "../return-to";
import { showToast } from "../toast";

export function SignIn() {
  const me = useMeQuery();
  const [signIn, { isLoading: signingIn }] = useSignInMutation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      await signIn({ email, password }).unwrap();
      await navigate(returnTarget(searchParams.get("next")), { replace: true });
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.status === 422 || failure.status === 429) {
        setFormError(failure.message);
        setPassword("");
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  return (
    <SignedOutLayout>
      {me.isError && (
        <SignedOutForm onSubmit={submit}>
          <SignedOutHeading title="Sign in" />
          <SignedOutFields>
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
            <Field label="Password">
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
          </SignedOutFields>
          {formError && <SignedOutFormError>{formError}</SignedOutFormError>}
          <Button
            variant="primary"
            type="submit"
            block
            disabled={signingIn}
            aria-busy={signingIn || undefined}>
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
          <Link
            to="/forgot-password"
            className="tl-signed-out__link">
            Forgot password?
          </Link>
        </SignedOutForm>
      )}
    </SignedOutLayout>
  );
}