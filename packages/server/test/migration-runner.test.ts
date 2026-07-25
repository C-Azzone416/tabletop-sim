import { describe, it, expect, vi } from "vitest";
import {
  runMigrations,
  formatMigrationFailure,
  redactDatabaseUrl,
  type MigrationClient,
} from "../../db/migration-runner.js";

describe("redactDatabaseUrl", () => {
  it("returns host only — never the credentials or database name", () => {
    const redacted = redactDatabaseUrl("postgres://someuser:supersecret@db.example.com:5432/proddb");
    expect(redacted).toBe("db.example.com");
    expect(redacted).not.toContain("someuser");
    expect(redacted).not.toContain("supersecret");
    expect(redacted).not.toContain("proddb");
  });

  it("falls back to a placeholder rather than throwing on an unparseable string", () => {
    expect(redactDatabaseUrl("not a url at all")).toBe("(unparseable connection string)");
  });
});

describe("formatMigrationFailure", () => {
  it("names the failing file and includes SQLSTATE, message, and present diagnostic fields", () => {
    const err = {
      message: 'column "foo" already exists',
      code: "42701",
      detail: "Column already exists in relation.",
      position: "37",
      table: "games",
    };

    const output = formatMigrationFailure("013_broken.sql", err);

    expect(output).toContain("Migration failed: 013_broken.sql");
    expect(output).toContain("SQLSTATE: 42701");
    expect(output).toContain('message: column "foo" already exists');
    expect(output).toContain("detail: Column already exists in relation.");
    expect(output).toContain("position: 37");
    expect(output).toContain("table: games");
  });

  it("omits diagnostic fields that aren't present, rather than printing them empty", () => {
    const output = formatMigrationFailure("001_x.sql", { message: "syntax error" });
    expect(output).not.toContain("detail:");
    expect(output).not.toContain("hint:");
    expect(output).not.toContain("constraint:");
  });

  it("includes the stack when present", () => {
    const output = formatMigrationFailure("001_x.sql", { message: "boom", stack: "Error: boom\n    at somewhere" });
    expect(output).toContain("at somewhere");
  });

  it("falls back to String(err) when the error has no message (non-Error thrown value)", () => {
    const output = formatMigrationFailure("001_x.sql", "a plain string failure");
    expect(output).toContain("message: a plain string failure");
  });
});

describe("runMigrations", () => {
  function makeMockClient(overrides: { failOn?: string } = {}) {
    const calls: { text: string; params?: unknown[] }[] = [];
    const client: MigrationClient = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.startsWith("SELECT name FROM _migrations")) {
          return { rows: [{ name: "001_already.sql" }] };
        }
        if (overrides.failOn && text.includes(overrides.failOn)) {
          throw { message: "relation does not exist", code: "42P01" };
        }
        return { rows: [] };
      }),
    };
    return { client, calls };
  }

  it("applies every pending migration in order, wrapping each in BEGIN/COMMIT", async () => {
    const { client, calls } = makeMockClient();
    const readFile = vi.fn((path: string) => `-- content of ${path}`);

    const result = await runMigrations(
      client,
      "/migrations",
      ["001_already.sql", "002_new.sql", "003_new.sql"],
      { readFile, log: () => {} },
    );

    expect(result.appliedCount).toBe(2);
    expect(result.pendingCount).toBe(2);

    const texts = calls.map(c => c.text);
    // 001 is already applied — never re-run.
    expect(texts).not.toContain("-- content of /migrations/001_already.sql");
    // 002 and 003 each get BEGIN, content, INSERT, COMMIT in that order.
    const idx002Begin = texts.indexOf("BEGIN");
    const idx002Content = texts.indexOf("-- content of /migrations/002_new.sql");
    const idx002Insert = texts.findIndex(t => t.startsWith("INSERT INTO _migrations"));
    expect(idx002Begin).toBeLessThan(idx002Content);
    expect(idx002Content).toBeLessThan(idx002Insert);
  });

  it("skips migrations already recorded in _migrations", async () => {
    const { client } = makeMockClient();
    const readFile = vi.fn((path: string) => `-- content of ${path}`);
    const log = vi.fn();

    await runMigrations(client, "/migrations", ["001_already.sql"], { readFile, log });

    expect(readFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("already applied"));
  });

  // #212 negative path: a deliberately-broken migration proves the
  // diagnostics actually render (not just a generic message).
  it("throws a formatted error naming the failing file when a migration's DDL fails", async () => {
    const { client } = makeMockClient({ failOn: "content of /migrations/002_broken.sql" });
    const readFile = vi.fn((path: string) => `-- content of ${path}`);

    await expect(
      runMigrations(client, "/migrations", ["002_broken.sql"], { readFile, log: () => {} }),
    ).rejects.toThrow(/Migration failed: 002_broken\.sql[\s\S]*SQLSTATE: 42P01/);
  });

  // #212 negative path: an interrupted run (the DDL succeeds, the INSERT
  // fails/is killed) proves the transaction holds — ROLLBACK is issued and
  // no partial state is left applied-but-unrecorded.
  it("rolls back when the INSERT into _migrations fails after the DDL succeeded", async () => {
    const calls: string[] = [];
    const client: MigrationClient = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.startsWith("SELECT name FROM _migrations")) return { rows: [] };
        if (text.startsWith("INSERT INTO _migrations")) {
          throw new Error("connection terminated unexpectedly");
        }
        return { rows: [] };
      }),
    };

    await expect(
      runMigrations(client, "/migrations", ["002_new.sql"], {
        readFile: () => "-- some DDL",
        log: () => {},
      }),
    ).rejects.toThrow(/connection terminated unexpectedly/);

    expect(calls).toContain("BEGIN");
    expect(calls).toContain("ROLLBACK");
    // COMMIT must never be reached — the whole point of the guarantee.
    expect(calls).not.toContain("COMMIT");
  });

  it("continues to attempt ROLLBACK even if the connection is already broken, without masking the original error", async () => {
    const client: MigrationClient = {
      query: vi.fn(async (text: string) => {
        if (text.startsWith("SELECT name FROM _migrations")) return { rows: [] };
        if (text === "ROLLBACK") throw new Error("connection already closed");
        if (text === "-- some DDL") throw { message: "syntax error", code: "42601" };
        return { rows: [] };
      }),
    };

    await expect(
      runMigrations(client, "/migrations", ["002_new.sql"], {
        readFile: () => "-- some DDL",
        log: () => {},
      }),
    ).rejects.toThrow(/SQLSTATE: 42601/);
  });

  it("attaches the original error as `cause` so the top-level catch can distinguish it from a connection-level failure", async () => {
    const client: MigrationClient = {
      query: vi.fn(async (text: string) => {
        if (text.startsWith("SELECT name FROM _migrations")) return { rows: [] };
        if (text === "-- some DDL") throw { message: "boom", code: "XX000" };
        return { rows: [] };
      }),
    };

    try {
      await runMigrations(client, "/migrations", ["002_new.sql"], {
        readFile: () => "-- some DDL",
        log: () => {},
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).cause).toMatchObject({ message: "boom", code: "XX000" });
    }
  });
});
