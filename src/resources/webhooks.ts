import type { Transport } from "../transport.js";

export type WebhookEvent = "dataset.ready" | "job.completed" | "job.failed";

const VALID_EVENTS = new Set<WebhookEvent>(["dataset.ready", "job.completed", "job.failed"]);

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

function webhookFromDict(data: Record<string, unknown>): Webhook {
  return {
    id: String(data["id"] ?? ""),
    url: String(data["url"] ?? ""),
    events: (data["events"] as WebhookEvent[]) ?? [],
    active: Boolean(data["active"] ?? true),
    createdAt: String(data["created_at"] ?? ""),
  };
}

export class WebhooksResource {
  constructor(private readonly _t: Transport) {}

  async register(url: string, events: WebhookEvent[]): Promise<Webhook> {
    const invalid = events.filter((e) => !VALID_EVENTS.has(e));
    if (invalid.length > 0) {
      throw new Error(`Unknown event types: ${invalid.join(", ")}. Valid: ${[...VALID_EVENTS].join(", ")}`);
    }
    const data = (await this._t.post("/webhooks", { url, events })) as Record<string, unknown>;
    return webhookFromDict(data);
  }

  async list(): Promise<Webhook[]> {
    const data = (await this._t.get("/webhooks")) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return items.map(webhookFromDict);
  }

  async delete(webhookId: string): Promise<void> {
    await this._t.delete(`/webhooks/${webhookId}`);
  }
}
