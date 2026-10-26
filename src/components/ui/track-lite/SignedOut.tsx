import type { ComponentProps, ReactNode } from "react";
import { FieldError } from "./Field";
import { Logo } from "./Logo";

export function SignedOutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tl-signed-out">
      <header className="tl-signed-out__bar">
        <Logo size="signed-out" />
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

export function SignedOutMessage({
  title,
  text,
  children,
}: {
  title?: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="tl-signed-out__message">
      {title && <h1 className="tl-signed-out__title">{title}</h1>}
      {text && <p className="tl-signed-out__lede">{text}</p>}
      {children}
    </div>
  );
}

export function SignedOutAlert({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div
      role="alert"
      className="tl-signed-out__alert">
      <p className="tl-signed-out__alert-text">{text}</p>
      {children}
    </div>
  );
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

export function SignedOutValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="tl-field__label">{label}</span>
      <p className="tl-signed-out__value">{children}</p>
    </div>
  );
}