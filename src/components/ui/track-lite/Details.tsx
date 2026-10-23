import { type MouseEvent, type ReactNode, useId } from "react";

export function DetailsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="tl-details">
      <div className="tl-details__column">{children}</div>
    </main>
  );
}

export function DetailsSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="tl-details__section">
      <div className="tl-details__head">
        <h2
          id={headingId}
          className="tl-meta__label">
          {title}
        </h2>
        {aside && <span className="tl-details__aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export type CountRowProps = {
  href: string;
  label: string;
  icon: ReactNode;
  name: string;
  count: number;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function CountRow({ href, label, icon, name, count, onClick }: CountRowProps) {
  return (
    <a
      href={href}
      aria-label={label}
      onClick={onClick}
      className="tl-count-row">
      <span aria-hidden="true">{icon}</span>
      <span>{name}</span>
      <span className="tl-count-row__count">{count}</span>
    </a>
  );
}

export function DetailsNote({ children }: { children: ReactNode }) {
  return <p className="tl-details__note">{children}</p>;
}