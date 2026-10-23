import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Logo } from "./Logo";

afterEach(cleanup);

it("Logo in both sizes shows a hidden mark and the Tracklite wordmark once, sized by its modifier class", () => {
  for (const size of ["rail", "signed-out"] as const) {
    const { container } = render(<Logo size={size} />);

    expect(screen.getAllByText("Tracklite")).toHaveLength(1);
    expect(container.textContent).toBe("Tracklite");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild?.classList.contains(`tl-logo--${size}`)).toBe(true);

    cleanup();
  }
});