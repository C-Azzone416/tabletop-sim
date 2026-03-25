import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeProfile, resetIds } from "./fixtures.js";

/**
 * WS upgrade authentication tests.
 *
 * These tests verify the authenticateUpgrade function that drives the
 * WS close(4001) behavior in the server's /ws route handler:
 *   - null result → socket.close(4001, 'Unauthenticated')
 *   - non-null result → connection accepted, setAuthenticatedUser called
 */

vi.mock("../src/db/profiles.js", () => ({
  getProfileById: vi.fn(),
}));

import * as profilesDb from "../src/db/profiles.js";
import { authenticateUpgrade } from "../src/ws/auth.js";

const mockProfilesDb = vi.mocked(profilesDb);

describe("WS upgrade — authenticateUpgrade (drives close 4001)", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
  });

  it("returns null (→ close 4001) when profileId query param is missing", async () => {
    const result = await authenticateUpgrade({
      url: "/ws?name=Alice",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns null (→ close 4001) when name query param is missing", async () => {
    const result = await authenticateUpgrade({
      url: "/ws?profileId=prof-1",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns null (→ close 4001) when both params are missing", async () => {
    const result = await authenticateUpgrade({
      url: "/ws",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns null (→ close 4001) when profile not found in DB", async () => {
    mockProfilesDb.getProfileById.mockResolvedValue(null);

    const result = await authenticateUpgrade({
      url: "/ws?profileId=nonexistent&name=Alice",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
    expect(mockProfilesDb.getProfileById).toHaveBeenCalledWith("nonexistent");
  });

  it("returns null (→ close 4001) when name does not match stored profile name", async () => {
    const profile = makeProfile({ id: "prof-1", name: "Alice" });
    mockProfilesDb.getProfileById.mockResolvedValue(profile);

    const result = await authenticateUpgrade({
      url: "/ws?profileId=prof-1&name=Bob",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns AuthenticatedUser (→ connection accepted) with valid profileId and matching name", async () => {
    const profile = makeProfile({ id: "prof-1", name: "Alice" });
    mockProfilesDb.getProfileById.mockResolvedValue(profile);

    const result = await authenticateUpgrade({
      url: "/ws?profileId=prof-1&name=Alice",
      headers: { host: "localhost:3001" },
    });

    expect(result).toEqual({ profileId: "prof-1", name: "Alice" });
  });

  it("handles undefined url gracefully (→ close 4001)", async () => {
    const result = await authenticateUpgrade({
      url: undefined,
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });
});
