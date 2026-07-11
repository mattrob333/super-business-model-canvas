import { normalizeCompanyName } from "../db/company-scope.js";
import { degraded, type EvidenceCandidate, type FeedFetcher, type FeedRunInput, type FeedRuntimeConfig } from "./types.js";

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
    webSearchFetcher(config, fetcher),
    fredSeriesFetcher(config, fetcher),
    googleTrendsFetcher(config, fetcher),
    gdeltCountFetcher(fetcher),
    githubRepoStatsFetcher(config, fetcher),
    secEdgarFilingsFetcher(config, fetcher),
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

interface SearchLegResult {
  provider: string;
  outcome: "ok" | "failed";
  reason?: string;
  evidence?: EvidenceCandidate[];
  payload?: Record<string, unknown>;
}

/**
 * xAI killed Live Search on 2026-01-12 (HTTP 410 "Live search is deprecated"
 * — confirmed via the [web_search] logging added for the 2026-07-08
 * diagnose). Every search-backed skill was silently broken since, so this is
 * now a provider chain rather than a single vendor call: Exa (semantic
 * search, full page text) -> Firecrawl search (same key that already powers
 * page scraping) -> xAI, migrated onto their Responses/Agent-Tools API
 * (`/v1/responses` + `tools: [{type: "web_search"}]`) rather than the dead
 * Live Search endpoint — same contract `supabase/functions/_shared/grok-
 * client.ts` already uses in production. Each leg is tried in order and the
 * first with real evidence wins; every attempt logs a `[web_search]` line so
 * a diagnose run shows exactly which providers were tried and why they did
 * or didn't return evidence. Renamed from `grok_live_search` (2026-07-08,
 * same session) because Grok is no longer the default or only provider —
 * required a matching `data_feeds` migration since `FeedRunner.loadFeed`
 * throws on an unregistered feed key.
 */
function webSearchFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "web_search",
    async run(input) {
      const query = input.query ?? readString(input.config.query) ?? input.companyName;
      if (!query) return degraded("web_search", "No query configured for web search");

      const legs: Array<() => Promise<SearchLegResult>> = [];
      if (config.exaApiKey) legs.push(() => runExaSearch(config, fetcher, input, query));
      if (config.firecrawlApiKey) legs.push(() => runFirecrawlSearch(config, fetcher, input, query));
      if (config.xaiApiKey) legs.push(() => runXaiAgentSearch(config, fetcher, query));

      if (legs.length === 0) {
        return degraded("web_search", "No search provider configured — set EXA_API_KEY, FIRECRAWL_API_KEY, or XAI_API_KEY");
      }

      const failures: string[] = [];
      for (const leg of legs) {
        const result = await leg();
        if (result.outcome === "ok" && result.evidence && result.evidence.length > 0) {
          console.log(`[web_search] ok via ${result.provider} evidence=${result.evidence.length}`);
          return { health: "ok", payload: result.payload ?? {}, evidence: result.evidence, metrics: [] };
        }
        const reason = result.reason ?? "no evidence returned";
        console.warn(`[web_search] ${result.provider} failed: ${reason}`);
        failures.push(`${result.provider}: ${reason}`);
      }
      return degraded("web_search", failures.join(" | "));
    },
  };
}

async function runExaSearch(config: FeedRuntimeConfig, fetcher: FetchLike, input: FeedRunInput, query: string): Promise<SearchLegResult> {
  const hasFilters = Boolean(input.recencyDays || input.searchCategory);
  const first = await exaSearchOnce(config, fetcher, input, query, true);
  if (first.outcome === "ok" || !hasFilters) return first;
  // Recency/category filters can legitimately return nothing (undated pages
  // are excluded by startPublishedDate) — stale evidence beats a dead skill,
  // so retry once unfiltered before giving the leg up.
  console.warn(`[web_search] exa filtered query empty (${first.reason}) — retrying without filters`);
  return exaSearchOnce(config, fetcher, input, query, false);
}

async function exaSearchOnce(
  config: FeedRuntimeConfig,
  fetcher: FetchLike,
  input: FeedRunInput,
  query: string,
  applyFilters: boolean,
): Promise<SearchLegResult> {
  const body: Record<string, unknown> = {
    query,
    numResults: 5,
    contents: { text: { maxCharacters: 1500 } },
  };
  if (applyFilters && input.searchCategory) body.category = input.searchCategory;
  if (applyFilters && input.recencyDays) {
    body.startPublishedDate = new Date(Date.now() - input.recencyDays * 86_400_000).toISOString();
  }
  const response = await fetcher("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.exaApiKey!,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = (await response.text().catch(() => "")).slice(0, 300);
    return { provider: "exa", outcome: "failed", reason: `HTTP ${response.status}${errBody ? ` — ${errBody.slice(0, 160)}` : ""}` };
  }
  const payload = await response.json() as Record<string, unknown>;
  const results = Array.isArray(payload.results) ? payload.results as Record<string, unknown>[] : [];
  const evidence = results
    .map((item, index): EvidenceCandidate | null => {
      const url = readString(item.url);
      const text = readString(item.text);
      if (!url || !text) return null;
      return {
        title: readString(item.title) ?? `Web search: ${query} (${index + 1})`,
        sourceType: "news",
        sourceName: "Exa",
        sourceUrl: url,
        sourceDate: readString(item.publishedDate),
        excerpt: text.slice(0, 1500),
        metadata: { feedKey: input.feedKey, query, provider: "exa" },
      };
    })
    .filter((item): item is EvidenceCandidate => item !== null);
  if (evidence.length === 0) return { provider: "exa", outcome: "failed", reason: "no results with page text" };
  return { provider: "exa", outcome: "ok", evidence, payload };
}

async function runFirecrawlSearch(config: FeedRuntimeConfig, fetcher: FetchLike, input: FeedRunInput, query: string): Promise<SearchLegResult> {
  const body: Record<string, unknown> = {
    query,
    limit: 5,
    scrapeOptions: { formats: ["markdown"] },
  };
  // Firecrawl's recency knob is Google's coarse tbs buckets, so the day
  // count rounds up to the next bucket. No category equivalent: the news
  // source type changes the response shape (data.news), not worth the fork.
  const tbs = tbsForRecencyDays(input.recencyDays);
  if (tbs) body.tbs = tbs;
  const response = await fetcher("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.firecrawlApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 300);
    return { provider: "firecrawl_search", outcome: "failed", reason: `HTTP ${response.status}${body ? ` — ${body.slice(0, 160)}` : ""}` };
  }
  const payload = await response.json() as Record<string, unknown>;
  // Firecrawl has shipped both shapes: v2 docs show {data: {web: [...]}},
  // earlier responses were a flat {data: [...]}. Accept either.
  const data = payload.data;
  const web = Array.isArray(data)
    ? data as Record<string, unknown>[]
    : Array.isArray((data as Record<string, unknown> | undefined)?.web)
      ? (data as Record<string, unknown>).web as Record<string, unknown>[]
      : [];
  const evidence = web
    .map((item, index): EvidenceCandidate | null => {
      const url = readString(item.url);
      const markdown = readString(item.markdown);
      const description = readString(item.description);
      if (!url || (!markdown && !description)) return null;
      return {
        title: readString(item.title) ?? `Web search: ${query} (${index + 1})`,
        sourceType: "news",
        sourceName: "Firecrawl Search",
        sourceUrl: url,
        excerpt: markdown ? cleanMarkdownExcerpt(markdown, 1500) : description,
        metadata: { feedKey: input.feedKey, query, provider: "firecrawl_search" },
      };
    })
    .filter((item): item is EvidenceCandidate => item !== null);
  if (evidence.length === 0) return { provider: "firecrawl_search", outcome: "failed", reason: "no results with content" };
  return { provider: "firecrawl_search", outcome: "ok", evidence, payload };
}

function tbsForRecencyDays(days: number | undefined): string | undefined {
  if (!days || days <= 0) return undefined;
  if (days <= 1) return "qdr:d";
  if (days <= 7) return "qdr:w";
  if (days <= 31) return "qdr:m";
  if (days <= 366) return "qdr:y";
  return undefined;
}

/**
 * Overridable via the XAI_MODEL Fly secret so a retired/renamed model id can
 * be flipped without a code deploy. Matches the canonical model in
 * `supabase/functions/_shared/xai-models.ts` (XAI_CHAT_MODEL) — the previous
 * default `grok-4-fast` predated that rename.
 */
const DEFAULT_XAI_MODEL = "grok-4.3";

/**
 * xAI's Live Search (`search_parameters` on /v1/chat/completions) returned
 * HTTP 410 "Live search is deprecated. Please switch to the Agent Tools API"
 * as of 2026-01-12 — confirmed live via the [web_search] diagnose logging.
 * This now calls the replacement Responses API (`/v1/responses` with
 * `tools: [{type: "web_search"}]`), the same contract already proven in
 * production by `supabase/functions/_shared/grok-client.ts`'s
 * `buildResponsesBody`/`extractResponsesText`. Citations come back as a
 * top-level `citations` array of `{url, title, snippet}` (or bare URL
 * strings on older responses) rather than the old scheme's flat URL list, so
 * each citation becomes its own evidence item with its own excerpt instead
 * of every citation sharing one blob of text.
 */
async function runXaiAgentSearch(config: FeedRuntimeConfig, fetcher: FetchLike, query: string): Promise<SearchLegResult> {
  const model = config.xaiModel ?? DEFAULT_XAI_MODEL;
  const response = await fetcher("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.xaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: "Search the live web and return concise sourced snippets.",
      input: query,
      // x_search is xAI's unique advantage over the Exa/Firecrawl legs:
      // X-native signal (partnership announcements, launch chatter) that web
      // crawls miss. Grok picks which tool(s) to invoke per query.
      tools: [{ type: "web_search" }, { type: "x_search" }],
      reasoning: { effort: "low" },
      stream: false,
    }),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[web_search] HTTP ${response.status} from api.x.ai/v1/responses (model=${model})${body ? ` body=${body}` : ""}`);
    return { provider: "xai", outcome: "failed", reason: `HTTP ${response.status} (model=${model})${body ? ` — ${body.slice(0, 160)}` : ""}` };
  }
  const payload = await response.json() as Record<string, unknown>;
  const text = extractResponsesOutputText(payload);
  const citations = extractXaiCitations(payload);
  // A 200 with nothing in it used to come back health "ok" with an empty
  // excerpt, which skills filtered to zero evidence — the failure surfaced
  // rooms away as "could not retrieve industry evidence". Call it what it
  // is at the source.
  if (!text.trim() && citations.length === 0) {
    console.warn(`[web_search] empty response (model=${model}) — no output text and no citations for query=${JSON.stringify(query)}`);
    return { provider: "xai", outcome: "failed", reason: `no output text and no citations (model=${model}) — check XAI_MODEL and web_search tool availability` };
  }
  const evidence: EvidenceCandidate[] = citations.length > 0
    ? citations.map((citation, index) => ({
        title: citation.title ?? `Web search: ${query} (${index + 1})`,
        sourceType: "news",
        sourceName: "xAI Agent Search",
        sourceUrl: citation.url,
        excerpt: citation.snippet ?? text,
        metadata: { feedKey: "web_search", query, provider: "xai" },
      }))
    : [{
        title: `Web search: ${query}`,
        sourceType: "news",
        sourceName: "xAI Agent Search",
        excerpt: text,
        metadata: { feedKey: "web_search", query, provider: "xai" },
      }];
  return { provider: "xai", outcome: "ok", evidence, payload };
}

function extractResponsesOutputText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output as Record<string, unknown>[] : [];
  let text = "";
  for (const item of output) {
    if (item.type !== "message") continue;
    const content = Array.isArray(item.content) ? item.content as Record<string, unknown>[] : [];
    for (const block of content) {
      if (block.type === "output_text" && typeof block.text === "string") text += block.text;
    }
  }
  return text;
}

interface XaiCitation {
  url: string;
  title?: string;
  snippet?: string;
}

function extractXaiCitations(payload: Record<string, unknown>): XaiCitation[] {
  if (!Array.isArray(payload.citations)) return [];
  const citations: XaiCitation[] = [];
  for (const item of payload.citations) {
    if (typeof item === "string") {
      citations.push({ url: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = readString(record.url) ?? readString(record.source_url);
    if (!url) continue;
    citations.push({ url, title: readString(record.title), snippet: readString(record.snippet) });
  }
  return citations;
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

/**
 * SEC EDGAR requires no API key — just a descriptive contact User-Agent per
 * their fair-access policy (an anonymous/generic UA gets throttled or
 * blocked). Overridable via SEC_EDGAR_USER_AGENT if the contact changes.
 */
const DEFAULT_SEC_EDGAR_USER_AGENT = "Super BMC research@superbmc.com";

/** Public-company filing text (10-K risk factors, segment revenue, strategy
 * language in their own words) as evidence — the free complement to
 * `web_search` for the many competitors that ARE SEC-registered filers.
 * Needs zero paid configuration, so it's registered unconditionally.
 *
 * Two layers, degrading independently:
 * 1. Company match (name -> CIK via the SEC's static ticker index) + recent
 *    filing list from the submissions API. Well-established, stable shape —
 *    every EDGAR wrapper library relies on it.
 * 2. IF a query is given: full-text search scoped to that CIK, for quote-
 *    level excerpts. This session could not live-verify the search response
 *    field names (data.sec.gov/efts.sec.gov were blocked by the dev sandbox's
 *    network policy) — implemented from well-documented public usage, but
 *    genuinely unverified. It is wrapped so a shape mismatch degrades THIS
 *    layer only; layer 1's filing list still ships. First live diagnose run
 *    is the real confirmation — check for `[sec_edgar_filings]` log lines.
 *
 * Many real competitors are privately held or foreign-listed (not SEC
 * filers) — a "no match" is an honest, expected outcome, not a bug.
 */
function secEdgarFilingsFetcher(config: FeedRuntimeConfig, fetcher: FetchLike): FeedFetcher {
  return {
    feedKey: "sec_edgar_filings",
    async run(input) {
      const companyName = input.companyName ?? readString(input.config.company_name);
      if (!companyName) return degraded("sec_edgar_filings", "No company name provided for SEC EDGAR lookup");

      const userAgent = config.secEdgarUserAgent ?? DEFAULT_SEC_EDGAR_USER_AGENT;
      const match = await resolveEdgarFiler(fetcher, userAgent, companyName);
      if (!match) {
        return degraded(
          "sec_edgar_filings",
          `No SEC-registered filer matched "${companyName}" — likely privately held or foreign-listed`,
        );
      }
      console.log(`[sec_edgar_filings] matched "${companyName}" -> ${match.title} (CIK ${match.cik}, score=${match.score.toFixed(2)})`);

      const submissions = await fetchEdgarSubmissions(fetcher, userAgent, match);
      if (!submissions) {
        return degraded("sec_edgar_filings", `Matched SEC filer ${match.title} (CIK ${match.cik}) but the submissions API failed`);
      }

      const evidence = filingListEvidence(match, submissions);
      if (evidence.length === 0) {
        return degraded("sec_edgar_filings", `Matched SEC filer ${match.title} (CIK ${match.cik}) but it has no filings on record`);
      }

      const query = input.query ?? readString(input.config.query);
      if (query) {
        try {
          const searchHits = await fetchEdgarFullTextSearch(fetcher, userAgent, match, query);
          evidence.push(...searchHits);
          console.log(`[sec_edgar_filings] full-text search "${query}" -> ${searchHits.length} hits`);
        } catch (error) {
          // Best-effort layer 2 — a shape mismatch or transient failure must
          // not take down layer 1's already-good filing-list evidence.
          console.warn(`[sec_edgar_filings] full-text search failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return {
        health: "ok",
        payload: { match, submissionsUrl: edgarSubmissionsUrl(match.cik) },
        evidence,
        metrics: [],
      };
    },
  };
}

interface EdgarFilerMatch {
  cik: string;
  cikPadded: string;
  title: string;
  ticker?: string;
  score: number;
}

/**
 * SEC's static ticker->CIK index (~8k entries, refreshed periodically by
 * the SEC, no auth). Matched by normalized-token Jaccard similarity rather
 * than exact string equality: EDGAR titles are legal-filing style ("GRAINGER
 * W W INC") and rarely match a canvas company name's word order or
 * punctuation ("W.W. Grainger") verbatim.
 */
async function resolveEdgarFiler(fetcher: FetchLike, userAgent: string, companyName: string): Promise<EdgarFilerMatch | null> {
  const response = await fetcher("https://www.sec.gov/files/company_tickers.json", {
    headers: { "user-agent": userAgent },
  });
  if (!response.ok) {
    console.warn(`[sec_edgar_filings] ticker index fetch failed with HTTP ${response.status}`);
    return null;
  }
  const index = await response.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
  const queryTokens = tokenSet(companyName);
  if (queryTokens.size === 0) return null;

  let best: EdgarFilerMatch | null = null;
  for (const entry of Object.values(index)) {
    const titleTokens = tokenSet(entry.title);
    const score = jaccardSimilarity(queryTokens, titleTokens);
    if (score > (best?.score ?? 0)) {
      const cik = String(entry.cik_str);
      best = { cik, cikPadded: cik.padStart(10, "0"), title: entry.title, ticker: entry.ticker, score };
    }
  }
  // Below this, token overlap is coincidental (shared generic words like
  // "group" or "holdings") rather than a real identity match.
  const MATCH_THRESHOLD = 0.5;
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

function tokenSet(name: string): Set<string> {
  const normalized = normalizeCompanyName(name) ?? name.toLowerCase();
  return new Set(normalized.split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface EdgarSubmissions {
  recentForms: string[];
  recentDates: string[];
  recentAccessions: string[];
  recentPrimaryDocs: string[];
}

function edgarSubmissionsUrl(cikPadded: string): string {
  return `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
}

async function fetchEdgarSubmissions(fetcher: FetchLike, userAgent: string, match: EdgarFilerMatch): Promise<EdgarSubmissions | null> {
  const response = await fetcher(edgarSubmissionsUrl(match.cikPadded), {
    headers: { "user-agent": userAgent },
  });
  if (!response.ok) {
    console.warn(`[sec_edgar_filings] submissions fetch failed for CIK ${match.cik} with HTTP ${response.status}`);
    return null;
  }
  const payload = await response.json() as Record<string, unknown>;
  const filings = payload.filings as Record<string, unknown> | undefined;
  const recent = filings?.recent as Record<string, unknown> | undefined;
  const forms = Array.isArray(recent?.form) ? recent.form as string[] : [];
  const dates = Array.isArray(recent?.filingDate) ? recent.filingDate as string[] : [];
  const accessions = Array.isArray(recent?.accessionNumber) ? recent.accessionNumber as string[] : [];
  const primaryDocs = Array.isArray(recent?.primaryDocument) ? recent.primaryDocument as string[] : [];
  return { recentForms: forms, recentDates: dates, recentAccessions: accessions, recentPrimaryDocs: primaryDocs };
}

/**
 * The forms that actually carry strategy/competitive-position language, as
 * opposed to routine ownership paperwork (Form 3/4/5) that would otherwise
 * dominate "most recent" and crowd out anything worth reading.
 */
const STRATEGIC_FORMS = new Set(["10-K", "10-Q", "8-K", "20-F", "6-K", "DEF 14A"]);
const MAX_FILING_EVIDENCE = 5;

function filingListEvidence(match: EdgarFilerMatch, submissions: EdgarSubmissions): EvidenceCandidate[] {
  const rows = submissions.recentForms
    .map((form, index) => ({
      form,
      date: submissions.recentDates[index],
      accession: submissions.recentAccessions[index],
      primaryDoc: submissions.recentPrimaryDocs[index],
    }))
    .filter((row) => row.date && row.accession);

  const strategic = rows.filter((row) => STRATEGIC_FORMS.has(row.form));
  const selected = (strategic.length > 0 ? strategic : rows).slice(0, MAX_FILING_EVIDENCE);

  return selected.map((row) => {
    const accessionNoDashes = row.accession.replace(/-/g, "");
    const docUrl = row.primaryDoc
      ? `https://www.sec.gov/Archives/edgar/data/${match.cik}/${accessionNoDashes}/${row.primaryDoc}`
      : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${match.cik}&type=${encodeURIComponent(row.form)}`;
    return {
      title: `${match.title}: ${row.form} filed ${row.date}`,
      sourceType: "filing" as const,
      sourceName: "SEC EDGAR",
      sourceUrl: docUrl,
      sourceDate: row.date,
      excerpt: `${match.title} (CIK ${match.cik}${match.ticker ? `, ticker ${match.ticker}` : ""}) filed a ${row.form} with the SEC on ${row.date}.`,
      metadata: { cik: match.cik, form: row.form, accession: row.accession, matchScore: match.score },
    };
  });
}

/**
 * UNVERIFIED LIVE (see fetcher doc comment): field names follow the public
 * EDGAR full-text-search UI's known backend contract as best understood
 * without live access. Any parse failure throws, which the caller treats as
 * non-fatal — this layer only adds quote-level excerpts on top of the
 * always-reliable filing list.
 */
async function fetchEdgarFullTextSearch(
  fetcher: FetchLike,
  userAgent: string,
  match: EdgarFilerMatch,
  query: string,
): Promise<EvidenceCandidate[]> {
  const url = new URL("https://efts.sec.gov/LATEST/search-index");
  url.searchParams.set("q", query);
  url.searchParams.set("forms", [...STRATEGIC_FORMS].join(","));
  url.searchParams.set("ciks", match.cikPadded);
  const response = await fetcher(url, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`full-text search HTTP ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const hits = (payload.hits as Record<string, unknown> | undefined)?.hits;
  if (!Array.isArray(hits)) throw new Error("unexpected full-text search response shape (no hits[])");

  return hits.slice(0, 5).map((hit): EvidenceCandidate | null => {
    const record = hit as Record<string, unknown>;
    const source = record._source as Record<string, unknown> | undefined;
    const id = readString(record._id);
    if (!source || !id) return null;
    const [accession, filename] = id.split(":");
    const form = readString(source.form) ?? (Array.isArray(source.root_forms) ? readString(source.root_forms[0]) : undefined);
    const date = readString(source.file_date);
    if (!accession || !filename) return null;
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${match.cik}/${accession.replace(/-/g, "")}/${filename}`;
    return {
      title: `${match.title}: "${query}" in ${form ?? "a filing"}${date ? ` (${date})` : ""}`,
      sourceType: "filing",
      sourceName: "SEC EDGAR full-text search",
      sourceUrl: docUrl,
      sourceDate: date,
      excerpt: `${match.title} filing matched the search "${query}"${form ? ` in a ${form}` : ""}${date ? ` filed ${date}` : ""}. Open the filing for the exact language.`,
      metadata: { cik: match.cik, form, query },
    };
  }).filter((item): item is EvidenceCandidate => item !== null);
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
