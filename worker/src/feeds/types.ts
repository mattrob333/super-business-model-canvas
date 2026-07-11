export type FeedHealth = "ok" | "degraded" | "failing";
export type EvidenceSourceType = "website" | "filing" | "news" | "transcript" | "social" | "api" | "document" | "manual";

export interface FeedRunInput {
  accountId: string;
  feedKey: string;
  cacheKey: string;
  config: Record<string, unknown>;
  companyName?: string;
  companyUrl?: string;
  query?: string;
  /**
   * web_search only: restrict results to pages published within this many
   * days. Watch-style skills (launches, partnerships, hiring) set this so a
   * two-year-old announcement can't masquerade as a current move; mining
   * skills (communities, industry structure) leave it unset — recency
   * filtering drops undated evergreen pages.
   */
  recencyDays?: number;
  /** web_search only: Exa category hint (their enum; only these two have proven useful). */
  searchCategory?: "news" | "company";
}

export interface EvidenceCandidate {
  title: string;
  sourceType: EvidenceSourceType;
  sourceName?: string;
  sourceUrl?: string;
  sourceDate?: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricCandidate {
  metricKey: string;
  value: number;
  label?: string;
  sectionKey?: string;
  inputs?: Record<string, unknown>;
}

export interface FeedRunResult {
  health: FeedHealth;
  payload: Record<string, unknown>;
  evidence: EvidenceCandidate[];
  metrics: MetricCandidate[];
  error?: string;
}

export interface FeedFetcher {
  feedKey: string;
  run(input: FeedRunInput): Promise<FeedRunResult>;
}

export interface FeedRuntimeConfig {
  firecrawlApiKey?: string;
  xaiApiKey?: string;
  xaiModel?: string;
  exaApiKey?: string;
  fredApiKey?: string;
  googleTrendsApiKey?: string;
  githubToken?: string;
  /**
   * SEC EDGAR requires no API key — only a descriptive contact User-Agent
   * per their fair-access policy. Optional override; the fetcher has a
   * sensible hardcoded default, so this feed works with zero configuration.
   */
  secEdgarUserAgent?: string;
  fetch?: typeof fetch;
  /** Abort outbound feed requests after this many ms (default 120s). */
  fetchTimeoutMs?: number;
}

export function degraded(feedKey: string, reason: string): FeedRunResult {
  return {
    health: "degraded",
    payload: { degraded: true, feedKey, reason },
    evidence: [],
    metrics: [],
    error: reason,
  };
}
