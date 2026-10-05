import type { MouseEvent } from "react";
import { useLinkClickHandler } from "react-router";
import { RailItem, type RailItemProps } from "../components/ui/track-lite";

export function useRouterClick(href: string) {
  return useLinkClickHandler(href) as (event: MouseEvent<HTMLElement>) => void;
}

export function RouterRailItem(props: RailItemProps & { href: string }) {
  const onClick = useRouterClick(props.href);
  return (
    <RailItem
      {...props}
      onClick={onClick}
    />
  );
}