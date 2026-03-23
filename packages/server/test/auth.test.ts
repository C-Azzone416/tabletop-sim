import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeProfile, resetIds } from "./fixtures.js";

vi.mock("../src/db/profiles.js", () => ({
  getProfileById: vi.fn(),
}));

import * as profilesDb from "../src/db/profiles.js";
import { authenticateUpgrade } from "../src/ws/auth.js";

const mockProfilesDb = vi.mocked(profilesDb);

describe("auth — authenticateUpgrade", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
  });

  it("returns user when profile exists and name matches", async () => {
    const profile = makeProfile({ id: "prof-1", name: "Alice" });
    mockProfilesDb.getProfileById.mockResolvedValue(profile);

    const result = await authenticateUpgrade({
      url: "/ws?profileId=prof-1&name=Alice",
      headers: { host: "localhost:3001" },
    });

    expect(result).toEqual({ profileId: "prof-1", name: "Alice" });
  });

  it("returns null when profileId is missing", async () => {
    const result = await authenticateUpgrade({
      url: "/ws?name=Alice",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns null when name is missing", async () => {
    const result = await authenticateUpgrade({
      url: "/ws?profileId=prof-1",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns null when profile does not exist", async () => {
    mockProfilesDb.getProfileById.mockResolvedValue(null);

    const result = await authenticateUpgrade({
      url: "/ws?profileId=nonexistent&name=Alice",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("returns null when name does not match profile", async () => {
    const profile = makeProfile({ id: "prof-1", name: "Alice" });
    mockProfilesDb.getProfileById.mockResolvedValue(profile);

    const result = await authenticateUpgrade({
      url: "/ws?profileId=prof-1&name=Bob",
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });

  it("handles missing url gracefully", async () => {
    const result = await authenticateUpgrade({
      url: undefined,
      headers: { host: "localhost:3001" },
    });

    expect(result).toBeNull();
  });
});
