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
  fredApiKey?: string;
  googleTrendsApiKey?: string;
  githubToken?: string;
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
