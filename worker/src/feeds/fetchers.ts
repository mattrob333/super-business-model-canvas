import { degraded, type FeedFetcher, type FeedRuntimeConfig } from "./types.js";

type FetchLike = typeof fetch;

/**
 * Feed requests hit arbitrary third-party endpoints; a hung request would
 * otherwise pin the job forever (the queue heartbeat keeps a stuck handler
 * alive), leaving its agent run "running" with no terminal state. Live
 * incident 2026-07-05: a competitor crawl never finished.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

function withTimeout(fetcher: FetchLike, timeoutMs: number): FetchLike {
  return ((input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]) =>
    fetcher(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })) as FetchLike;
}

export function createFeedFetchers(config: FeedRuntimeConfig = {}): Map<string, FeedFetcher> {
  const fetcher = withTimeout(config.fetch ?? fetch, config.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  const fetchers: FeedFetcher[] = [
    firecrawlScrapeFetcher(config, fetcher),
    grokLiveSearchFetcher(config, fetcher),
    fredSeriesFetcher(config, fetcher),
    googleTrendsFetcher(config, fetcher),
    gdeltCountFetcher(fetcher),
    githubRepoStatsFetcher(config, fetcher),
  ];
  return new Map(fetchers.map((item) => [item.feedKey, item]));
}

function firecrawlScrapeFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "firecrawl_scrape",
    async run(input) {
      if (!config.firecrawlApiKey) return degraded("firecrawl_scrape", "FIRECRAWL_API_KEY is not configured");
      const url = readString(input.config.url) ?? input.companyUrl;
      if (!url) return degraded("firecrawl_scrape", "No URL configured for Firecrawl scrape");

      const response = await fetcher("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.firecrawlApiKey}`,
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      if (!response.ok) {
        const hint = response.status === 403 ? " — the site blocks automated crawling" : "";
        return degraded("firecrawl_scrape", `Firecrawl scrape failed with HTTP ${response.status}${hint}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      const markdown = readString(payload.markdown) ?? readString((payload.data as Record<string, unknown> | undefined)?.markdown);
      return {
        health: "ok",
        payload,
        evidence: [{
          title: `${input.companyName ?? url} page scrape`,
          sourceType: "website",
          sourceName: "Firecrawl",
          sourceUrl: url,
          excerpt: markdown ? cleanMarkdownExcerpt(markdown, 1200) : undefined,
          metadata: { feedKey: input.feedKey },
        }],
        metrics: [],
      };
    },
  };
}

function grokLiveSearchFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "grok_live_search",
    async run(input) {
      if (!config.xaiApiKey) return degraded("grok_live_search", "XAI_API_KEY is not configured");
      const query = input.query ?? readString(input.config.query) ?? input.companyName;
      if (!query) return degraded("grok_live_search", "No query configured for Grok live search");

      const response = await fetcher("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.xaiApiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.3",
          messages: [
            { role: "system", content: "Search the live web and return concise sourced snippets." },
            { role: "user", content: query },
          ],
          search_parameters: { mode: "on", return_citations: true },
          stream: false,
        }),
      });
      if (!response.ok) return degraded("grok_live_search", `Grok search failed with HTTP ${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      const content = readString((((payload.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content);
      const citations = extractCitationUrls(payload);
      const evidence = citations.length > 0
        ? citations.map((url, index) => ({
            title: `Live search: ${query} (${index + 1})`,
            sourceType: "news" as const,
            sourceName: "Grok Live Search",
            sourceUrl: url,
            excerpt: content,
            metadata: { feedKey: input.feedKey, query },
          }))
        : [{
            title: `Live search: ${query}`,
            sourceType: "news" as const,
            sourceName: "Grok Live Search",
            excerpt: content,
            metadata: { feedKey: input.feedKey, query },
          }];
      return {
        health: "ok",
        payload,
        evidence,
        metrics: [],
      };
    },
  };
}

function fredSeriesFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "fred_series",
    async run(input) {
      if (!config.fredApiKey) return degraded("fred_series", "FRED_API_KEY is not configured");
      const series = readStringArray(input.config.series);
      const seriesIds = series.length > 0 ? series : ["FEDFUNDS"];
      const evidence = [];
      const metrics = [];
      const payload: Record<string, unknown> = {};

      for (const seriesId of seriesIds) {
        const url = new URL("https://api.stlouisfed.org/fred/series/observations");
        url.searchParams.set("series_id", seriesId);
        url.searchParams.set("api_key", config.fredApiKey);
        url.searchParams.set("file_type", "json");
        url.searchParams.set("sort_order", "desc");
        url.searchParams.set("limit", "1");
        const response = await fetcher(url);
        if (!response.ok) return degraded("fred_series", `FRED ${seriesId} failed with HTTP ${response.status}`);
        const json = await response.json() as { observations?: Array<{ date: string; value: string }> };
        payload[seriesId] = json;
        const observation = json.observations?.[0];
        const value = observation ? Number(observation.value) : NaN;
        if (Number.isFinite(value)) {
          metrics.push({ metricKey: `fred.${seriesId}`, value, label: seriesId, inputs: { date: observation?.date } });
          evidence.push({
            title: `FRED ${seriesId}`,
            sourceType: "api" as const,
            sourceName: "FRED",
            sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
            sourceDate: observation?.date,
            excerpt: `${seriesId}: ${value} on ${observation?.date}`,
            metadata: { seriesId, value },
          });
        }
      }

      return { health: "ok", payload, evidence, metrics };
    },
  };
}

function googleTrendsFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "google_trends",
    async run(input) {
      if (!config.googleTrendsApiKey) return degraded("google_trends", "GOOGLE_TRENDS_API_KEY is not configured");
      const keyword = readString(input.config.keyword) ?? input.companyName;
      if (!keyword) return degraded("google_trends", "No keyword configured for Google Trends");
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_trends");
      url.searchParams.set("q", keyword);
      url.searchParams.set("api_key", config.googleTrendsApiKey);
      const response = await fetcher(url);
      if (!response.ok) return degraded("google_trends", `Google Trends failed with HTTP ${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      const interest = latestTrendValue(payload, keyword);
      return {
        health: "ok",
        payload,
        evidence: [{
          title: `Google Trends interest: ${keyword}`,
          sourceType: "api",
          sourceName: "Google Trends",
          sourceUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}`,
          excerpt: interest === null ? undefined : `${keyword} latest Google Trends interest score: ${interest}.`,
          metadata: { keyword, provider: "serpapi" },
        }],
        metrics: interest === null ? [] : [{ metricKey: "google_trends.interest", value: interest, label: keyword, inputs: { keyword } }],
      };
    },
  };
}

function gdeltCountFetcher(fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "gdelt_count",
    async run(input) {
      const query = input.query ?? readString(input.config.query) ?? input.companyName;
      if (!query) return degraded("gdelt_count", "No query configured for GDELT");
      const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
      url.searchParams.set("query", query);
      url.searchParams.set("mode", "timelinevolraw");
      url.searchParams.set("format", "json");
      const response = await fetcher(url);
      if (!response.ok) return degraded("gdelt_count", `GDELT failed with HTTP ${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
      const count = timeline.reduce((sum, item) => sum + (typeof (item as Record<string, unknown>).value === "number" ? (item as Record<string, number>).value : 0), 0);
      return {
        health: "ok",
        payload,
        evidence: [{
          title: `GDELT news volume: ${query}`,
          sourceType: "news",
          sourceName: "GDELT",
          sourceUrl: url.toString(),
          excerpt: `${count} timeline volume points matched ${query}.`,
          metadata: { query, count },
        }],
        metrics: [{ metricKey: "gdelt.news_volume", value: count, label: query, inputs: { query } }],
      };
    },
  };
}

function githubRepoStatsFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "github_repo_stats",
    async run(input) {
      if (!config.githubToken) return degraded("github_repo_stats", "GITHUB_TOKEN is not configured");
      const repos = readStringArray(input.config.repos);
      if (repos.length === 0) return degraded("github_repo_stats", "No GitHub repos configured");
      const evidence = [];
      const metrics = [];
      const payload: Record<string, unknown> = {};
      for (const repo of repos) {
        const response = await fetcher(`https://api.github.com/repos/${repo}`, {
          headers: { authorization: `Bearer ${config.githubToken}` },
        });
        if (!response.ok) return degraded("github_repo_stats", `GitHub ${repo} failed with HTTP ${response.status}`);
        const json = await response.json() as Record<string, unknown>;
        payload[repo] = json;
        const stars = typeof json.stargazers_count === "number" ? json.stargazers_count : 0;
        const forks = typeof json.forks_count === "number" ? json.forks_count : 0;
        metrics.push({ metricKey: "github.stars", value: stars, label: repo, inputs: { repo } });
        metrics.push({ metricKey: "github.forks", value: forks, label: repo, inputs: { repo } });
        evidence.push({
          title: `GitHub repo stats: ${repo}`,
          sourceType: "api" as const,
          sourceName: "GitHub",
          sourceUrl: `https://github.com/${repo}`,
          excerpt: `${repo} has ${stars} stars and ${forks} forks.`,
          metadata: { repo, stars, forks },
        });
      }
      return { health: "ok", payload, evidence, metrics };
    },
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Page markdown starts with navigation link soup ("[Skip to main content](…)"),
 * which used to become the stored evidence excerpt verbatim — unreadable next
 * to a canvas item, and it wasted the extraction model's context on nav chrome
 * (owner live finding 2026-07-06). Reduce to prose BEFORE slicing the excerpt.
 */
export function cleanMarkdownExcerpt(markdown: string, maxLength: number): string {
  const cleaned = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")            // images
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")        // links -> label
    .replace(/\b(Skip to (main content|footer|navigation))\b/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[#>\-*_|\s]+$/gm, " ")                 // separator/heading-only lines
    .replace(/[#*_`>|]{1,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function extractCitationUrls(payload: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  collectCitationUrls(payload.citations, urls);
  const choices = payload.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      collectCitationUrls((choice as { citations?: unknown }).citations, urls);
      const message = (choice as { message?: unknown }).message;
      if (message && typeof message === "object") collectCitationUrls((message as { citations?: unknown }).citations, urls);
    }
  }
  return [...urls];
}

function collectCitationUrls(value: unknown, urls: Set<string>): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const url = typeof item === "string"
      ? item
      : item && typeof item === "object"
        ? readString((item as { url?: unknown; source_url?: unknown }).url)
          ?? readString((item as { url?: unknown; source_url?: unknown }).source_url)
        : undefined;
    if (url) urls.add(url);
  }
}

function latestTrendValue(payload: Record<string, unknown>, keyword: string): number | null {
  const interest = payload.interest_over_time;
  if (!interest || typeof interest !== "object") return null;
  const timeline = (interest as { timeline_data?: unknown }).timeline_data;
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  const latest = timeline[timeline.length - 1];
  if (!latest || typeof latest !== "object") return null;
  const values = (latest as { values?: unknown }).values;
  if (!Array.isArray(values)) return null;
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const record = value as { query?: unknown; value?: unknown; extracted_value?: unknown };
    if (record.query === keyword && typeof record.value === "number") return record.value;
    if (record.query === keyword && typeof record.extracted_value === "number") return record.extracted_value;
  }
  const first = values[0] as { value?: unknown; extracted_value?: unknown } | undefined;
  return typeof first?.value === "number"
    ? first.value
    : typeof first?.extracted_value === "number"
      ? first.extracted_value
      : null;
}
