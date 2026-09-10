import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { PlaySurface } from "../../app/components/flip/PlaySurface";

describe("PlaySurface (contract C2)", () => {
  const setup = (overrides: Partial<ComponentProps<typeof PlaySurface>> = {}) => {
    const onToggleFlatten = vi.fn();
    const props = {
      seatCount: 2 as const,
      flattened: false,
      onToggleFlatten,
      children: <div>board contents</div>,
      ...overrides,
    };
    const utils = render(<PlaySurface {...props} />);
    return { ...utils, onToggleFlatten };
  };

  it("tilts 7° by default", () => {
    setup();
    const surface = screen.getByTestId("play-surface");
    expect(surface).toHaveAttribute("data-tilted", "true");
    expect(surface.style.transform).toBe("rotateX(7deg)");
  });

  it("flattens to 0° when flattened is true", () => {
    setup({ flattened: true });
    const surface = screen.getByTestId("play-surface");
    expect(surface).toHaveAttribute("data-tilted", "false");
    expect(surface.style.transform).toBe("rotateX(0deg)");
  });

  it("eases to 0° when zoomed, even if not flattened", () => {
    setup({ zoomed: true });
    const surface = screen.getByTestId("play-surface");
    expect(surface).toHaveAttribute("data-tilted", "false");
    expect(surface.style.transform).toBe("rotateX(0deg)");
  });

  it("suppresses the transition while a turn is in progress", () => {
    setup({ turnInProgress: true });
    const surface = screen.getByTestId("play-surface");
    expect(surface.style.transition).toBe("none");
  });

  it("animates normally when no turn is in progress", () => {
    setup({ turnInProgress: false });
    const surface = screen.getByTestId("play-surface");
    expect(surface.style.transition).not.toBe("none");
  });

  it.each([
    [2, "640px"],
    [3, "600px"],
    [4, "560px"],
    [5, "520px"],
  ] as const)("caps width at %ipx for %i seats", (seatCount, maxWidth) => {
    setup({ seatCount });
    const surface = screen.getByTestId("play-surface");
    const widthWrapper = surface.parentElement?.parentElement;
    expect(widthWrapper?.style.maxWidth).toBe(maxWidth);
  });

  it("calls onToggleFlatten when the flatten button is clicked", async () => {
    const user = userEvent.setup();
    const { onToggleFlatten } = setup();
    await user.click(screen.getByRole("button", { name: /flatten table/i }));
    expect(onToggleFlatten).toHaveBeenCalledTimes(1);
  });

  it("labels the button to tilt back when already flattened", () => {
    setup({ flattened: true });
    expect(screen.getByRole("button", { name: /tilt table/i })).toBeInTheDocument();
  });

  it("renders children inside the surface", () => {
    setup();
    expect(screen.getByText("board contents")).toBeInTheDocument();
  });
});
