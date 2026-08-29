import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "../app/page";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("../app/hooks/useMissionOutcomes", () => ({
  useMissionOutcomes: () => ({}),
}));

function setSession(user: { id: string; name: string } | null, status: string) {
  mockUseSession.mockReturnValue({
    data: user ? { user } : null,
    status,
  });
}

describe("Home (app/page.tsx)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("session loading state", () => {
    it("renders nothing while session status is loading", () => {
      setSession(null, "loading");
      const { container } = render(<Home />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("unauthenticated landing page", () => {
    beforeEach(() => {
      setSession(null, "unauthenticated");
    });

    it("shows the landing page with a Join button, not the sign-in form", () => {
      render(<Home />);
      expect(screen.getByText("Tabletop Simulator")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Choose your name")).not.toBeInTheDocument();
    });

    it("expands the sign-in form when Join is clicked", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      expect(screen.getByPlaceholderText("Choose your name")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Enter the Room" })).toBeInTheDocument();
    });

    it("disables the submit button until a name is entered", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      const submit = screen.getByRole("button", { name: "Enter the Room" });
      expect(submit).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText("Choose your name"), {
        target: { value: "Alice" },
      });
      expect(submit).not.toBeDisabled();
    });

    it("signs in successfully and refreshes the router", async () => {
      mockSignIn.mockResolvedValue({ error: undefined });
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "Join" }));
      await user.type(screen.getByPlaceholderText("Choose your name"), "Alice");
      await user.click(screen.getByRole("button", { name: "Enter the Room" }));

      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        name: "Alice",
        redirect: false,
      });
      expect(mockRefresh).toHaveBeenCalled();
      expect(screen.queryByText("Could not sign in. Please try a different name.")).not.toBeInTheDocument();
    });

    it("shows an error message when sign-in fails", async () => {
      mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "Join" }));
      await user.type(screen.getByPlaceholderText("Choose your name"), "Alice");
      await user.click(screen.getByRole("button", { name: "Enter the Room" }));

      expect(
        await screen.findByText("Could not sign in. Please try a different name."),
      ).toBeInTheDocument();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("does not submit when name is only whitespace", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      fireEvent.change(screen.getByPlaceholderText("Choose your name"), {
        target: { value: "   " },
      });
      const submit = screen.getByRole("button", { name: "Enter the Room" });
      expect(submit).toBeDisabled();
    });
  });

  describe("authenticated landing", () => {
    beforeEach(() => {
      setSession({ id: "profile-1", name: "Alice" }, "authenticated");
    });

    it("renders the landing with the player's name", () => {
      render(<Home />);
      expect(screen.getByText("Playing as")).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("renders the mission progress indicators (#170)", () => {
      render(<Home />);
      expect(screen.getByLabelText("Mission progress")).toBeInTheDocument();
      expect(screen.getByTestId("mission-progress-1")).toBeInTheDocument();
    });

    it("signs out when Change name is clicked", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Change name" }));
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });

    it("routes to /play when Play is clicked (#318 cutover)", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(mockPush).toHaveBeenCalledWith("/play");
    });

    it("no longer offers inline create/join controls", () => {
      render(<Home />);
      expect(screen.queryByRole("button", { name: "Create New Game" })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Enter code")).not.toBeInTheDocument();
    });
  });
});
