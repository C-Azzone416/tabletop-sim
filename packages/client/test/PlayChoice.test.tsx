import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayChoice from "../app/play/page";
import JoinGameStub from "../app/play/join/page";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}));

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

function setSession(user: { id: string; name: string } | null, status: string) {
  mockUseSession.mockReturnValue({ data: user ? { user } : null, status });
}

const SIGNED_IN = { id: "profile-1", name: "Ada" };

describe("/play — the Host / Join choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession(SIGNED_IN, "authenticated");
  });

  describe("session handling (#310: no new gating, none removed)", () => {
    it("renders nothing while the session is loading", () => {
      setSession(null, "loading");
      const { container } = render(<PlayChoice />);
      expect(container).toBeEmptyDOMElement();
    });

    it("sends a signed-out visitor to the landing page rather than rendering the choice", () => {
      setSession(null, "unauthenticated");
      const { container } = render(<PlayChoice />);
      expect(mockReplace).toHaveBeenCalledWith("/");
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("the two branches", () => {
    it("offers exactly Join Game and Host New Game, each linking to its own route", () => {
      render(<PlayChoice />);

      expect(screen.getByRole("link", { name: /Join Game/ })).toHaveAttribute(
        "href",
        "/play/join",
      );
      expect(screen.getByRole("link", { name: /Host New Game/ })).toHaveAttribute(
        "href",
        "/play/host",
      );
    });

    it("routes with real links, not buttons — browser back has to work", () => {
      render(<PlayChoice />);
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("puts Join first in document order, so it takes the thumb position stacked on mobile", () => {
      render(<PlayChoice />);
      const optionNames = screen
        .getAllByRole("link")
        .map((link) => link.textContent ?? "")
        .filter((text) => /Join Game|Host New Game/.test(text));

      expect(optionNames[0]).toMatch(/Join Game/);
      expect(optionNames[1]).toMatch(/Host New Game/);
    });

    it("gives both options equal weight — same surface classes, neither styled as the accent", () => {
      render(<PlayChoice />);
      const join = screen.getByRole("link", { name: /Join Game/ });
      const host = screen.getByRole("link", { name: /Host New Game/ });

      expect(join.className).toBe(host.className);
      expect(join.className).not.toMatch(/accent/);
      expect(host.className).not.toMatch(/accent/);
    });

    it("stacks on mobile and sits side by side from the sm breakpoint up", () => {
      render(<PlayChoice />);
      const grid = screen.getByRole("link", { name: /Join Game/ }).parentElement!;

      expect(grid.className).toMatch(/grid-cols-1/);
      expect(grid.className).toMatch(/sm:grid-cols-2/);
    });

    it("uses no --wire-* token — Host and Join are chrome, not wires (DESIGN-APPENDIX §3)", () => {
      const { container } = render(<PlayChoice />);
      const classes = Array.from(container.querySelectorAll<HTMLElement>("*"))
        .map((el) => el.className)
        .join(" ");

      expect(classes).not.toMatch(/wire-/);
      expect(classes).not.toMatch(/\bbg-p[1-5]\b/);
    });
  });

  describe("back affordance", () => {
    it("offers ← Back to the landing page", () => {
      render(<PlayChoice />);
      expect(screen.getByRole("link", { name: /← Back/ })).toHaveAttribute("href", "/");
    });
  });
});

// /play/host is no longer a stub: #316 (PR #323) shipped the real
// game-selection screen there, covered by test/HostSelection.test.tsx.
describe("/play/join stub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession(SIGNED_IN, "authenticated");
  });

  it("renders the join target with ← Back to /play", () => {
    render(<JoinGameStub />);

    expect(screen.getByRole("heading", { name: "Join Game" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /← Back/ })).toHaveAttribute("href", "/play");
  });

  it("applies the same session condition as /play", () => {
    setSession(null, "unauthenticated");
    const { container } = render(<JoinGameStub />);

    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(container).toBeEmptyDOMElement();
  });
});
