import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GAME_REGISTRY } from "@tabletop/shared";
import { DevLoader } from "../app/dev/DevLoader";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

const FLIP_SCENARIOS = [
  { name: "flip7-ready", summary: "A player holds 6 unique numbers." },
  { name: "flip3-bust", summary: "A drawn Flip 3 will bust." },
];

function mockFetch(overrides: Partial<Record<string, unknown>> = {}) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url.includes("/dev/flip-scenarios")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ scenarios: FLIP_SCENARIOS }),
      });
    }
    if (url.includes("/dev/seed")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            joinCode: "ABC123",
            profileId: "p1",
            playerName: "Dev",
            players: [{ name: "Dev", profileId: "p1" }],
            ...overrides,
          }),
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("DevLoader — Flip seed UI (#384)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue(undefined);
  });

  it("game selector is driven by the registry, not a hardcoded list", () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(<DevLoader />);
    for (const game of GAME_REGISTRY.filter((g) => g.id === "wire-game" || g.id === "flip")) {
      expect(screen.getByRole("option", { name: game.displayName })).toBeInTheDocument();
    }
    // Spades is registered but not dev-seedable yet — must not appear.
    expect(screen.queryByRole("option", { name: "Spades" })).not.toBeInTheDocument();
  });

  it("shows the Wire mission dropdown by default, no Flip controls", () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    render(<DevLoader />);
    expect(screen.getByLabelText("Mission:")).toBeInTheDocument();
    expect(screen.queryByLabelText("Players:")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scenario:")).not.toBeInTheDocument();
  });

  it("switches to player-count and scenario controls for Flip, honouring registry min/max", async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<DevLoader />);

    await user.selectOptions(screen.getByLabelText("Game:"), "flip");

    expect(screen.queryByLabelText("Mission:")).not.toBeInTheDocument();
    const playersSelect = screen.getByLabelText("Players:") as HTMLSelectElement;
    const flipEntry = GAME_REGISTRY.find((g) => g.id === "flip")!;
    const optionValues = Array.from(playersSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(
      Array.from(
        { length: flipEntry.maxPlayers - flipEntry.minPlayers + 1 },
        (_, i) => String(flipEntry.minPlayers + i),
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "flip7-ready" })).toBeInTheDocument();
    });
  });

  it("seeds Flip with gameType/playerCount/scenario and carries seatOptions through", async () => {
    const fetchMock = mockFetch({
      players: [
        { name: "Dev", profileId: "p1" },
        { name: "Alice", profileId: "p2" },
      ],
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<DevLoader />);

    await user.selectOptions(screen.getByLabelText("Game:"), "flip");
    await waitFor(() => screen.getByRole("option", { name: "flip7-ready" }));
    await user.selectOptions(screen.getByLabelText("Players:"), "5");
    await user.selectOptions(screen.getByLabelText("Scenario:"), "flip7-ready");
    await user.click(screen.getByRole("button", { name: "Seed Game" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    const seedCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/dev/seed"));
    expect(seedCall).toBeDefined();
    const body = JSON.parse((seedCall![1] as RequestInit).body as string);
    expect(body).toEqual({ gameType: "flip", playerCount: 5, scenario: "flip7-ready" });

    expect(mockSignIn).toHaveBeenCalledWith("credentials", { name: "Dev", redirect: false });
    const pushedUrl = mockPush.mock.calls[0][0] as string;
    expect(pushedUrl).toContain("/game/ABC123");
    expect(pushedUrl).toContain(
      `seatOptions=${encodeURIComponent(JSON.stringify([
        { name: "Dev", profileId: "p1" },
        { name: "Alice", profileId: "p2" },
      ]))}`,
    );
  });

  it("still seeds Wire with just a mission, unchanged", async () => {
    const fetchMock = mockFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<DevLoader />);

    await user.selectOptions(screen.getByLabelText("Mission:"), "3");
    await user.click(screen.getByRole("button", { name: "Seed Game" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const seedCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/dev/seed"));
    const body = JSON.parse((seedCall![1] as RequestInit).body as string);
    expect(body).toEqual({ mission: 3 });
  });
});
