import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFeedFetchers } from "../feeds/fetchers.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import { FeedRefreshHandler } from "../jobs/feed-refresh.js";

describe("feed fetchers", () => {
  it("gracefully degrades API-key backed feeds when env is missing", async () => {
    const fetchers = createFeedFetchers();

    await expect(fetchers.get("firecrawl_scrape")?.run(baseInput("firecrawl_scrape")))
      .resolves.toMatchObject({ health: "degraded", error: "FIRECRAWL_API_KEY is not configured" });
    await expect(fetchers.get("grok_live_search")?.run(baseInput("grok_live_search")))
      .resolves.toMatchObject({
        health: "degraded",
        error: "No search provider configured — set EXA_API_KEY, FIRECRAWL_API_KEY, or XAI_API_KEY",
      });
    await expect(fetchers.get("fred_series")?.run(baseInput("fred_series")))
      .resolves.toMatchObject({ health: "degraded", error: "FRED_API_KEY is not configured" });
    await expect(fetchers.get("google_trends")?.run(baseInput("google_trends")))
      .resolves.toMatchObject({ health: "degraded", error: "GOOGLE_TRENDS_API_KEY is not configured" });
    await expect(fetchers.get("github_repo_stats")?.run(baseInput("github_repo_stats")))
      .resolves.toMatchObject({ health: "degraded", error: "GITHUB_TOKEN is not configured" });
  });

  it("normalizes Firecrawl scrape fixtures into website evidence", async () => {
    const fetch = fixtureFetch("firecrawl-scrape.json");
    const fetchers = createFeedFetchers({ firecrawlApiKey: "firecrawl-key", fetch });

    const result = await fetchers.get("firecrawl_scrape")?.run({
      ...baseInput("firecrawl_scrape"),
      companyUrl: "https://acme.example/pricing",
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "Acme page scrape", sourceType: "website", sourceUrl: "https://acme.example/pricing" }],
    });
    expect(result?.evidence[0]?.excerpt).toContain("Pro plan for $29");
  });

  it("normalizes Grok live-search fixtures into news evidence", async () => {
    const fetch = fixtureFetch("grok-live-search.json");
    const fetchers = createFeedFetchers({ xaiApiKey: "xai-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({
      ...baseInput("grok_live_search"),
      query: "Acme analytics",
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [
        { title: "Live search: Acme analytics (1)", sourceType: "news", sourceName: "Grok Live Search", sourceUrl: "https://news.example/acme-analytics" },
        { title: "Live search: Acme analytics (2)", sourceType: "news", sourceName: "Grok Live Search", sourceUrl: "https://acme.example/blog/enterprise-analytics" },
      ],
    });
    expect(result?.evidence[0]?.excerpt).toContain("enterprise analytics product");
    const fetchMock = fetch as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } };
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      model: "grok-4-fast",
      search_parameters: { mode: "on", return_citations: true },
    });
  });

  it("sends the configured XAI_MODEL override to Grok", async () => {
    const fetch = fixtureFetch("grok-live-search.json");
    const fetchers = createFeedFetchers({ xaiApiKey: "xai-key", xaiModel: "grok-next", fetch });

    await fetchers.get("grok_live_search")?.run({ ...baseInput("grok_live_search"), query: "Acme analytics" });

    const fetchMock = fetch as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } };
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "grok-next" });
  });

  it("degrades Grok responses that carry no content and no citations instead of reporting ok", async () => {
    const fetch = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { role: "assistant", content: "" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const fetchers = createFeedFetchers({ xaiApiKey: "xai-key", fetch });

    await expect(fetchers.get("grok_live_search")?.run({ ...baseInput("grok_live_search"), query: "Acme analytics" }))
      .resolves.toMatchObject({
        health: "degraded",
        error: expect.stringContaining("no content and no citations"),
      });
  });

  it("surfaces the Grok error body when the API rejects the request", async () => {
    const fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: "The model grok-4-fast does not exist" }),
      { status: 404 },
    ));
    const fetchers = createFeedFetchers({ xaiApiKey: "xai-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({ ...baseInput("grok_live_search"), query: "Acme analytics" });
    expect(result).toMatchObject({ health: "degraded" });
    expect(result?.error).toContain("HTTP 404");
    expect(result?.error).toContain("does not exist");
  });

  it("normalizes Exa fixtures into news evidence", async () => {
    const fetch = fixtureFetch("exa-search.json");
    const fetchers = createFeedFetchers({ exaApiKey: "exa-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({
      ...baseInput("grok_live_search"),
      query: "Acme analytics",
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [
        { title: "Acme launches enterprise analytics suite", sourceType: "news", sourceName: "Exa", sourceUrl: "https://news.example/acme-analytics", sourceDate: "2026-06-15" },
        { title: "Acme blog: enterprise analytics deep dive", sourceType: "news", sourceName: "Exa", sourceUrl: "https://acme.example/blog/enterprise-analytics" },
      ],
    });
    expect(result?.evidence[0]?.excerpt).toContain("enterprise analytics product");
    const fetchMock = fetch as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } };
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.exa.ai/search");
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.headers).toMatchObject({ "x-api-key": "exa-key" });
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({ query: "Acme analytics" });
  });

  it("normalizes Firecrawl search fixtures into news evidence", async () => {
    const fetch = fixtureFetch("firecrawl-search.json");
    const fetchers = createFeedFetchers({ firecrawlApiKey: "firecrawl-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({
      ...baseInput("grok_live_search"),
      query: "Acme analytics",
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "Acme launches enterprise analytics suite", sourceType: "news", sourceName: "Firecrawl Search", sourceUrl: "https://news.example/acme-analytics" }],
    });
    expect(result?.evidence[0]?.excerpt).toContain("enterprise analytics product");
    const fetchMock = fetch as unknown as { mock: { calls: Array<[unknown, RequestInit?]> } };
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.firecrawl.dev/v2/search");
  });

  it("tries providers in order Exa -> Firecrawl -> xAI and stops at the first with evidence", async () => {
    const exaFixture = readFixture("exa-search.json");
    const fetch = vi.fn(async (url: unknown) => {
      if (String(url) === "https://api.exa.ai/search") {
        return new Response(exaFixture, { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected call to ${String(url)}`);
    });
    const fetchers = createFeedFetchers({ exaApiKey: "exa-key", firecrawlApiKey: "firecrawl-key", xaiApiKey: "xai-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({ ...baseInput("grok_live_search"), query: "Acme analytics" });

    expect(result?.health).toBe("ok");
    expect(result?.evidence[0]?.sourceName).toBe("Exa");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to Firecrawl when Exa returns no usable results, and logs both attempts", async () => {
    const fetch = vi.fn(async (url: unknown) => {
      if (String(url) === "https://api.exa.ai/search") {
        return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url) === "https://api.firecrawl.dev/v2/search") {
        return new Response(readFixture("firecrawl-search.json"), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected call to ${String(url)}`);
    });
    const fetchers = createFeedFetchers({ exaApiKey: "exa-key", firecrawlApiKey: "firecrawl-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({ ...baseInput("grok_live_search"), query: "Acme analytics" });

    expect(result?.health).toBe("ok");
    expect(result?.evidence[0]?.sourceName).toBe("Firecrawl Search");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("degrades with every provider's reason when all configured legs fail", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 500 }));
    const fetchers = createFeedFetchers({ exaApiKey: "exa-key", firecrawlApiKey: "firecrawl-key", xaiApiKey: "xai-key", fetch });

    const result = await fetchers.get("grok_live_search")?.run({ ...baseInput("grok_live_search"), query: "Acme analytics" });

    expect(result?.health).toBe("degraded");
    expect(result?.error).toContain("exa:");
    expect(result?.error).toContain("firecrawl_search:");
    expect(result?.error).toContain("xai:");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("normalizes FRED fixtures into API evidence and metrics", async () => {
    const fetch = fixtureFetch("fred-series.json");
    const fetchers = createFeedFetchers({ fredApiKey: "fred-key", fetch });

    const result = await fetchers.get("fred_series")?.run({
      ...baseInput("fred_series"),
      config: { series: ["FEDFUNDS"] },
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "FRED FEDFUNDS", sourceType: "api", sourceDate: "2026-06-01" }],
      metrics: [{ metricKey: "fred.FEDFUNDS", value: 4.25, label: "FEDFUNDS" }],
    });
  });

  it("normalizes Google Trends fixtures into interest evidence and metrics", async () => {
    const fetch = fixtureFetch("google-trends.json");
    const fetchers = createFeedFetchers({ googleTrendsApiKey: "trends-key", fetch });

    const result = await fetchers.get("google_trends")?.run({
      ...baseInput("google_trends"),
      config: { keyword: "Acme" },
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "Google Trends interest: Acme", sourceType: "api", sourceName: "Google Trends" }],
      metrics: [{ metricKey: "google_trends.interest", value: 72, label: "Acme" }],
    });
  });

  it("normalizes GDELT timeline-count fixtures into a news-volume metric", async () => {
    const fetch = fixtureFetch("gdelt-count.json");
    const fetchers = createFeedFetchers({ fetch });

    const result = await fetchers.get("gdelt_count")?.run({
      ...baseInput("gdelt_count"),
      query: "Acme AI",
    });

    expect(result).toMatchObject({
      health: "ok",
      metrics: [{ metricKey: "gdelt.news_volume", value: 5, label: "Acme AI" }],
    });
  });

  it("normalizes GitHub repo fixtures into evidence and metrics", async () => {
    const fetch = fixtureFetch("github-repo.json");
    const fetchers = createFeedFetchers({ githubToken: "github-token", fetch });

    const result = await fetchers.get("github_repo_stats")?.run({
      ...baseInput("github_repo_stats"),
      config: { repos: ["owner/repo"] },
    });

    expect(result).toMatchObject({
      health: "ok",
      evidence: [{ title: "GitHub repo stats: owner/repo", sourceType: "api" }],
      metrics: [
        { metricKey: "github.stars", value: 42, label: "owner/repo" },
        { metricKey: "github.forks", value: 7, label: "owner/repo" },
      ],
    });
  });
});

describe("FeedRefreshHandler", () => {
  it("does not serve degraded cache rows after a later successful configuration", async () => {
    const client = new FeedRunnerFakeClient();
    const keylessRunner = new FeedRunner(client.asSupabase(), { fetch: fixtureFetch("github-repo.json") });

    await expect(keylessRunner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo",
      force: true,
    })).resolves.toMatchObject({ health: "degraded" });

    expect(client.cacheRows[0]?.health).toBe("degraded");
    expect(Date.parse(client.cacheRows[0]?.expires_at ?? "") - Date.now()).toBeLessThanOrEqual(300_500);

    const fetch = fixtureFetch("github-repo.json");
    const configuredRunner = new FeedRunner(client.asSupabase(), { githubToken: "github-token", fetch });
    const refreshed = await configuredRunner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo",
    });
    expect(refreshed.health).toBe("ok");
    expect(refreshed.metrics).toContainEqual(expect.objectContaining({ metricKey: "github.stars", value: 42 }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves ok cache rows within TTL without refetching", async () => {
    const client = new FeedRunnerFakeClient();
    client.cacheRows.push({
      account_id: "account-1",
      feed_key: "github_repo_stats",
      cache_key: "repo",
      health: "ok",
      payload: { cached: true },
      evidence_candidates: [{ title: "Cached repo", sourceType: "api" }],
      metric_candidates: [{ metricKey: "github.stars", value: 99 }],
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      error: null,
    });
    const fetch = vi.fn(async () => {
      throw new Error("should not refetch");
    });
    const runner = new FeedRunner(client.asSupabase(), { githubToken: "github-token", fetch });

    await expect(runner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo",
    })).resolves.toMatchObject({ health: "ok", payload: { cached: true }, metrics: [{ metricKey: "github.stars", value: 99 }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("writes degraded feed health when an upstream returns 404", async () => {
    const client = new FeedRunnerFakeClient();
    const fetch = vi.fn(async () => new Response("not found", { status: 404 }));
    const runner = new FeedRunner(client.asSupabase(), { githubToken: "github-token", fetch });

    await expect(runner.refresh({
      accountId: "account-1",
      feedKey: "github_repo_stats",
      cacheKey: "repo-404",
      force: true,
    })).resolves.toMatchObject({ health: "degraded", error: "GitHub owner/repo failed with HTTP 404" });
    expect(client.cacheRows.at(-1)).toMatchObject({ health: "degraded" });
    expect(client.healthUpdates.at(-1)).toMatchObject({
      health: "degraded",
      last_error: "GitHub owner/repo failed with HTTP 404",
    });
  });

  it("requires an active scheduled loop matching feed_refresh:<feed_key>", async () => {
    const client = new FakeSupabaseClient();
    const handler = new FeedRefreshHandler({
      client: client.asSupabase(),
      feedRunner: {
        async refresh() {
          throw new Error("should not run");
        },
      } as never,
    });

    await expect(handler.handle({
      id: "job-1",
      account_id: "account-1",
      kind: "feed_refresh",
      payload: { feed_key: "github_repo_stats" },
      status: "running",
      attempts: 1,
      max_attempts: 3,
      agent_run_id: null,
      parent_run_id: null,
      cascade_run_id: null,
      claimed_by: "worker-a",
      locked_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      run_after: new Date().toISOString(),
      last_error: null,
      created_at: new Date().toISOString(),
    })).rejects.toThrow("No active scheduled loop authorizes feed_refresh:github_repo_stats");
  });
});

function baseInput(feedKey: string) {
  return {
    accountId: "account-1",
    feedKey,
    cacheKey: "cache-1",
    config: {},
    companyName: "Acme",
  };
}

function fixtureFetch(fileName: string) {
  return vi.fn(async () => new Response(readFixture(fileName), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
}

function readFixture(fileName: string): string {
  const fixtureUrl = new URL(`./fixtures/${fileName}`, import.meta.url);
  return readFileSync(fileURLToPath(fixtureUrl), "utf8");
}

class FakeSupabaseClient {
  asSupabase(): never {
    return this as never;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(table);
  }
}

class FakeQuery {
  constructor(private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(): this {
    return this;
  }

  limit(): Promise<{ data: unknown[]; error: null }> {
    if (this.table !== "scheduled_loops") throw new Error(`Unexpected table ${this.table}`);
    return Promise.resolve({ data: [], error: null });
  }
}

interface CacheFixtureRow {
  account_id: string;
  feed_key: string;
  cache_key: string;
  payload: Record<string, unknown>;
  evidence_candidates: unknown[];
  metric_candidates: unknown[];
  health: "ok" | "degraded" | "failing";
  error: string | null;
  expires_at: string;
}

class FeedRunnerFakeClient {
  public cacheRows: CacheFixtureRow[] = [];
  public healthUpdates: Array<Record<string, unknown>> = [];

  asSupabase(): never {
    return this as never;
  }

  from(table: string): FeedRunnerFakeQuery {
    return new FeedRunnerFakeQuery(this, table);
  }
}

class FeedRunnerFakeQuery {
  private readonly filters = new Map<string, unknown>();
  private gtFilter: [string, string] | null = null;
  private updateValue: Record<string, unknown> | null = null;

  constructor(
    private readonly client: FeedRunnerFakeClient,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  or(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.set(column, value);
    return this;
  }

  gt(column: string, value: string): this {
    this.gtFilter = [column, value];
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  upsert(value: CacheFixtureRow): Promise<{ error: null }> {
    const existingIndex = this.client.cacheRows.findIndex((row) =>
      row.account_id === value.account_id
      && row.feed_key === value.feed_key
      && row.cache_key === value.cache_key);
    if (existingIndex >= 0) this.client.cacheRows[existingIndex] = value;
    else this.client.cacheRows.push(value);
    return Promise.resolve({ error: null });
  }

  update(value: Record<string, unknown>): this {
    this.updateValue = value;
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: null }> {
    if (this.table === "data_feeds") {
      return Promise.resolve({
        data: {
          id: "feed-1",
          account_id: null,
          feed_key: this.filters.get("feed_key"),
          config: { repos: ["owner/repo"] },
          ttl_seconds: 604800,
        },
        error: null,
      });
    }

    if (this.table === "feed_cache") {
      const row = this.client.cacheRows.find((candidate) =>
        candidate.account_id === this.filters.get("account_id")
        && candidate.feed_key === this.filters.get("feed_key")
        && candidate.cache_key === this.filters.get("cache_key")
        && candidate.health === this.filters.get("health")
        && (!this.gtFilter || candidate.expires_at > this.gtFilter[1]));
      return Promise.resolve({ data: row ?? null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  then(resolve: (value: { error: null }) => void): void {
    if (this.table === "data_feeds" && this.updateValue) {
      this.client.healthUpdates.push(this.updateValue);
    }
    resolve({ error: null });
  }
}
