import { vi } from "vitest";

// Mock DATABASE_URL to prevent the db/client.ts from throwing
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

// Mock the neon sql client globally — all db modules import from db/client.ts
vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    // Returns a tagged template function mock
    const sqlMock = vi.fn().mockResolvedValue([]);
    return sqlMock;
  },
}));
