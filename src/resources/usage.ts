import type { Transport } from "../transport.js";

export interface UsageSnapshot {
  plan: string;
  creditsUsed: number;
  creditsLimit: number | null;
  creditsRemaining: number | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
}

export interface UsageHistoryItem {
  date: string;
  creditsUsed: number;
  jobsCount: number;
}

export interface QualityTrendItem {
  date: string;
  avgQualityScore: number;
  gradeDistribution: Record<string, number>;
  avgFieldFillRate: number | null;
  jobCount: number;
}

export interface RateLimitStatus {
  plan: string;
  unlimited: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  windowSeconds: number;
  resetInSeconds: number | null;
}

export class UsageResource {
  constructor(private readonly _t: Transport) {}

  async current(): Promise<UsageSnapshot> {
    const data = ((await this._t.get("/usage")) ?? {}) as Record<string, unknown>;
    const trial = (data["trial"] as Record<string, unknown> | null | undefined) ?? {};
    const usage = (data["usage"] as Record<string, unknown> | undefined) ?? {};
    const credits = (usage["credits"] as Record<string, unknown> | undefined) ?? {};
    return {
      plan: String(data["plan"] ?? ""),
      creditsUsed: Number(credits["used"] ?? 0),
      creditsLimit: (credits["limit"] as number | null | undefined) ?? null,
      creditsRemaining: (credits["remaining"] as number | null | undefined) ?? null,
      isTrial: Boolean(trial["is_trial"] ?? false),
      trialEndsAt: (trial["trial_ends_at"] as string | null | undefined) ?? null,
      trialDaysRemaining: (trial["trial_days_remaining"] as number | null | undefined) ?? null,
    };
  }

  /** @param period "7d" | "30d" | "90d". Default: "30d". */
  async history(period = "30d"): Promise<UsageHistoryItem[]> {
    const data = (await this._t.get("/usage/history", { period })) as Record<string, unknown>[] | null;
    return (data ?? []).map((item) => ({
      date: String(item["date"] ?? ""),
      creditsUsed: Number(item["credits_used"] ?? 0),
      jobsCount: Number(item["jobs_count"] ?? 0),
    }));
  }

  /** @param period "7d" | "30d" | "90d". Default: "30d". */
  async qualityTrend(period = "30d"): Promise<QualityTrendItem[]> {
    const data = (await this._t.get("/usage/quality-trend", { period })) as Record<string, unknown>[] | null;
    return (data ?? []).map((item) => ({
      date: String(item["date"] ?? ""),
      avgQualityScore: Number(item["avg_quality_score"] ?? 0),
      gradeDistribution: (item["grade_distribution"] as Record<string, number>) ?? {},
      avgFieldFillRate: (item["avg_field_fill_rate"] as number | null | undefined) ?? null,
      jobCount: Number(item["job_count"] ?? 0),
    }));
  }

  /** Current rate limit configuration and window usage. Does not consume a request slot. */
  async rateLimits(): Promise<RateLimitStatus> {
    const data = ((await this._t.get("/usage/rate-limits")) ?? {}) as Record<string, unknown>;
    return {
      plan: String(data["plan"] ?? ""),
      unlimited: Boolean(data["unlimited"] ?? false),
      limit: (data["limit"] as number | null | undefined) ?? null,
      used: (data["used"] as number | null | undefined) ?? null,
      remaining: (data["remaining"] as number | null | undefined) ?? null,
      windowSeconds: Number(data["window_seconds"] ?? 0),
      resetInSeconds: (data["reset_in_seconds"] as number | null | undefined) ?? null,
    };
  }
}
