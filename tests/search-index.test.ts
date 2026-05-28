import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canQuerySearchIndex, getSearchIndexProvider } from "@/lib/search-index";

const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  searchIndexProvider: process.env.SEARCH_INDEX_PROVIDER,
  meilisearchHost: process.env.MEILISEARCH_HOST,
  meilisearchApiKey: process.env.MEILISEARCH_API_KEY,
  typesenseHost: process.env.TYPESENSE_HOST,
  typesenseApiKey: process.env.TYPESENSE_API_KEY
};

describe("search index provider selection", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.SEARCH_INDEX_PROVIDER;
    delete process.env.MEILISEARCH_HOST;
    delete process.env.MEILISEARCH_API_KEY;
    delete process.env.TYPESENSE_HOST;
    delete process.env.TYPESENSE_API_KEY;
  });

  afterEach(() => {
    restoreEnv("DATABASE_URL", originalEnv.databaseUrl);
    restoreEnv("SEARCH_INDEX_PROVIDER", originalEnv.searchIndexProvider);
    restoreEnv("MEILISEARCH_HOST", originalEnv.meilisearchHost);
    restoreEnv("MEILISEARCH_API_KEY", originalEnv.meilisearchApiKey);
    restoreEnv("TYPESENSE_HOST", originalEnv.typesenseHost);
    restoreEnv("TYPESENSE_API_KEY", originalEnv.typesenseApiKey);
  });

  it("uses local search when no database is configured", () => {
    expect(getSearchIndexProvider()).toBe("local");
    expect(canQuerySearchIndex()).toBe(false);
  });

  it("defaults to postgres even when remote credentials are present", () => {
    process.env.DATABASE_URL = "postgresql://getthe:getthe@localhost:55432/getthe";
    process.env.MEILISEARCH_HOST = "http://localhost:7700";
    process.env.MEILISEARCH_API_KEY = "dev-key";

    expect(getSearchIndexProvider()).toBe("postgres");
    expect(canQuerySearchIndex()).toBe(false);
  });

  it("uses meilisearch only when explicitly requested", () => {
    process.env.DATABASE_URL = "postgresql://getthe:getthe@localhost:55432/getthe";
    process.env.SEARCH_INDEX_PROVIDER = "meilisearch";
    process.env.MEILISEARCH_HOST = "http://localhost:7700";
    process.env.MEILISEARCH_API_KEY = "dev-key";

    expect(getSearchIndexProvider()).toBe("meilisearch");
    expect(canQuerySearchIndex()).toBe(true);
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value) {
    process.env[key] = value;
  } else {
    delete process.env[key];
  }
}
