import type { MouseEvent, ReactNode } from "react";

export function Nav({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  return (
    <nav className="tl-nav">
      <div className="tl-nav__brand">{brand}</div>
      {children}
    </nav>
  );
}

export type NavLinkProps = {
  href: string;
  current?: boolean;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function NavLink({ href, current, children, onClick }: NavLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className="tl-navlink">
      {children}
    </a>
  );
}