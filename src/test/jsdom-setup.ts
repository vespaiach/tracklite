import "css.escape";
import { afterAll } from "vitest";

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

afterAll(nextAnimationFrame);