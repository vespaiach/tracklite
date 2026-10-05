import type { ComponentProps, ReactNode } from "react";
import { FieldError } from "./Field";

export function SignedOutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tl-signed-out">
      <header className="tl-signed-out__bar">
        <span className="tl-signed-out__brand">Tracklite</span>
      </header>
      <main className="tl-signed-out__main">{children}</main>
    </div>
  );
}

export function SignedOutForm(props: ComponentProps<"form">) {
  return (
    <form
      noValidate
      className="tl-signed-out__form"
      {...props}
    />
  );
}

export function SignedOutHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="tl-signed-out__heading">
      <h1 className="tl-signed-out__title">{title}</h1>
      {children && <p className="tl-signed-out__lede">{children}</p>}
    </div>
  );
}

export function SignedOutFields({ children }: { children: ReactNode }) {
  return <div className="tl-signed-out__fields">{children}</div>;
}

export function SignedOutFormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="tl-signed-out__form-error">
      <FieldError>{children}</FieldError>
    </div>
  );
}

export function SignedOutNote({ children }: { children: ReactNode }) {
  return <p className="tl-signed-out__note">{children}</p>;
}

export function SignedOutStatus({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="tl-signed-out__status">
      {children}
    </p>
  );
}