import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted ensures these are initialized before vi.mock factories run
const captured = vi.hoisted(() => ({
  authorize: null as null | ((credentials: Record<string, unknown>) => Promise<unknown>),
  jwt: null as null | ((args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Record<string, unknown>),
  session: null as null | ((args: { session: Record<string, unknown>; token: Record<string, unknown> }) => Record<string, unknown>),
  authorized: null as null | ((args: { auth: Record<string, unknown> | null; request: { nextUrl: URL } }) => boolean),
}));

vi.mock("next-auth", () => ({
  default: vi.fn((config: Record<string, unknown>) => {
    const providers = config.providers as Record<string, unknown>[];
    captured.authorize = providers[0].authorize as typeof captured.authorize;
    const callbacks = config.callbacks as Record<string, unknown> | undefined;
    captured.jwt = (callbacks?.jwt ?? null) as typeof captured.jwt;
    captured.session = (callbacks?.session ?? null) as typeof captured.session;
    captured.authorized = (callbacks?.authorized ?? null) as typeof captured.authorized;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  }),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config: Record<string, unknown>) => config),
}));

// Importing auth.ts triggers the NextAuth() call, populating captured.*
import "../auth";

describe("auth.ts", () => {
  describe("authorize()", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns null for empty name", async () => {
      const result = await captured.authorize!({ name: "" });
      expect(result).toBeNull();
    });

    it("returns null for whitespace-only name", async () => {
      const result = await captured.authorize!({ name: "   " });
      expect(result).toBeNull();
    });

    it("returns null for name longer than 20 chars", async () => {
      const result = await captured.authorize!({ name: "a".repeat(21) });
      expect(result).toBeNull();
    });

    it("returns null for non-string name", async () => {
      const result = await captured.authorize!({ name: 42 });
      expect(result).toBeNull();
    });

    it("returns null when fetch throws (network error)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      const result = await captured.authorize!({ name: "Alice" });
      expect(result).toBeNull();
    });

    it("returns null when server returns non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      const result = await captured.authorize!({ name: "Alice" });
      expect(result).toBeNull();
    });

    it("returns profile on successful server response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            profile: { id: "abc123", name: "Alice" },
          }),
        }),
      );
      const result = await captured.authorize!({ name: "Alice" });
      expect(result).toEqual({ id: "abc123", name: "Alice" });
    });

    it("trims name before validation and sending", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            profile: { id: "def456", name: "Bob" },
          }),
        }),
      );
      const result = await captured.authorize!({ name: "  Bob  " });
      expect(result).toEqual({ id: "def456", name: "Bob" });
    });
  });

  describe("jwt callback", () => {
    it("sets token.sub from user.id", () => {
      const token: Record<string, unknown> = {};
      const user = { id: "user-id-1", name: "Alice" };
      const result = captured.jwt!({ token, user });
      expect(result.sub).toBe("user-id-1");
    });

    it("leaves token.sub unchanged when user has no id", () => {
      const token: Record<string, unknown> = { sub: "existing-sub" };
      const result = captured.jwt!({ token, user: {} });
      expect(result.sub).toBe("existing-sub");
    });

    it("leaves token unchanged when no user provided", () => {
      const token: Record<string, unknown> = { sub: "existing-sub" };
      const result = captured.jwt!({ token });
      expect(result.sub).toBe("existing-sub");
    });
  });

  describe("session callback", () => {
    it("maps token.sub to session.user.id", () => {
      const session = { user: { name: "Alice" } } as Record<string, unknown>;
      const token = { sub: "user-id-1" };
      const result = captured.session!({ session, token });
      expect((result.user as Record<string, unknown>).id).toBe("user-id-1");
    });

    it("leaves session unchanged when token has no sub", () => {
      const session = { user: { name: "Alice" } } as Record<string, unknown>;
      const token = {};
      const result = captured.session!({ session, token });
      expect((result.user as Record<string, unknown>).id).toBeUndefined();
    });

    it("leaves session unchanged when session has no user", () => {
      const session = {} as Record<string, unknown>;
      const token = { sub: "user-id-1" };
      const result = captured.session!({ session, token });
      expect(result.user).toBeUndefined();
    });
  });

  // #182: without this callback, `auth` as middleware only populates
  // req.auth — it never actually redirects. This is what makes the
  // /game/:path* matcher in middleware.ts real.
  describe("authorized callback (#182)", () => {
    function req(url: string) {
      return { nextUrl: new URL(url) };
    }

    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("returns false when there is no session and no dev profileId param", () => {
      expect(captured.authorized!({ auth: null, request: req("http://localhost/game/ABC") })).toBe(false);
    });

    it("returns false when the session has no user", () => {
      expect(captured.authorized!({ auth: {}, request: req("http://localhost/game/ABC") })).toBe(false);
    });

    it("returns true when the session has a user", () => {
      expect(
        captured.authorized!({
          auth: { user: { id: "abc123", name: "Alice" } },
          request: req("http://localhost/game/ABC"),
        }),
      ).toBe(true);
    });

    it("returns false for a dev profileId param when dev tools are off (prod posture)", () => {
      expect(
        captured.authorized!({ auth: null, request: req("http://localhost/game/ABC?profileId=p1") }),
      ).toBe(false);
    });

    it("returns false when dev tools are on but no profileId param is present (closes the real gap)", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      expect(captured.authorized!({ auth: null, request: req("http://localhost/game/ABC") })).toBe(false);
    });

    it("returns true when dev tools are on and a profileId param is present (existing E2E harness)", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      expect(
        captured.authorized!({ auth: null, request: req("http://localhost/game/ABC?profileId=p1") }),
      ).toBe(true);
    });
  });
});
