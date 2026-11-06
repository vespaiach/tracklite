import type { MouseEvent } from "react";
import { useLinkClickHandler } from "react-router";

export function useRouterClick(href: string) {
  return useLinkClickHandler(href) as (event: MouseEvent<HTMLElement>) => void;
}