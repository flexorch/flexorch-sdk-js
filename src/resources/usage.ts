import type { Transport } from "../transport.js";

export interface UsageSnapshot {
  plan: string;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  resetAt: string;
  periodStart: string;
  periodEnd: string;
}

export class UsageResource {
  constructor(private readonly _t: Transport) {}

  async current(): Promise<UsageSnapshot> {
    const data = (await this._t.get("/usage/current")) as Record<string, unknown>;
    return {
      plan: String(data["plan"] ?? ""),
      creditsUsed: Number(data["credits_used"] ?? 0),
      creditsLimit: Number(data["credits_limit"] ?? 0),
      creditsRemaining: Number(data["credits_remaining"] ?? 0),
      resetAt: String(data["reset_at"] ?? ""),
      periodStart: String(data["period_start"] ?? ""),
      periodEnd: String(data["period_end"] ?? ""),
    };
  }
}
