import {
  AuthError,
  FlexOrchError,
  NotFoundError,
  QuotaError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "./errors.js";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function parseError(res: Response): Promise<FlexOrchError> {
  const status = res.status;
  let message = `HTTP ${status}`;
  let code = "";
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const err = (body["error"] ?? {}) as Record<string, unknown>;
    code = String(err["code"] ?? "");
    message = String(err["message"] ?? body["detail"] ?? message);
  } catch {
    message = (await res.text().catch(() => message)) || message;
  }
  if (status === 401) return new AuthError(message, status, code);
  if (status === 402) return new QuotaError(message, status, code);
  if (status === 404) return new NotFoundError(message, code);
  if (status === 422) return new ValidationError(message, code);
  if (status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60") || 60;
    return new RateLimitError(message, retryAfter);
  }
  if (status >= 500) return new ServerError(message, status, code);
  return new FlexOrchError(message, status, code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strip the standard {status, data, error} envelope every /v1/* endpoint
 * returns (see dev-docs/api-reference.md "Standart Response Wrapper" in the
 * flexorch repo). Values that don't match this shape are returned as-is.
 */
export function unwrap(body: unknown): unknown {
  if (
    body !== null &&
    typeof body === "object" &&
    "data" in body &&
    "error" in body &&
    typeof (body as Record<string, unknown>)["status"] === "string"
  ) {
    return (body as Record<string, unknown>)["data"];
  }
  return body;
}

export class Transport {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private maxRetries: number;
  private fetchFn: FetchFn;

  constructor(
    apiKey: string,
    baseUrl: string,
    timeout: number,
    maxRetries: number,
    fetchFn?: FetchFn,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = {
      "X-API-KEY": apiKey,
      "User-Agent": "flexorch-sdk-js/0.3.0",
    };
  }

  private url(path: string, params?: Record<string, string>): string {
    const base = `${this.baseUrl}/${path.replace(/^\//, "")}`;
    if (!params) return base;
    return `${base}?${new URLSearchParams(params)}`;
  }

  private async doRequest(
    method: string,
    path: string,
    options: {
      json?: unknown;
      params?: Record<string, string>;
      form?: FormData;
    } = {},
  ): Promise<unknown> {
    const url = this.url(path, options.params);
    const headers: Record<string, string> = { ...this.defaultHeaders };
    let body: string | FormData | undefined;

    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout * 1000);
      try {
        const res = await this.fetchFn(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (RETRY_STATUSES.has(res.status) && attempt < this.maxRetries - 1) {
          const wait = parseInt(res.headers.get("Retry-After") ?? "") || 2 ** attempt;
          await sleep(wait * 1000);
          continue;
        }

        if (!res.ok) throw await parseError(res);
        if (res.status === 204) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return null;
        const text = await res.text();
        if (!text.trim()) return null;
        return unwrap(JSON.parse(text));
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof FlexOrchError) throw err;
        lastError = err as Error;
        if (attempt < this.maxRetries - 1) await sleep(2 ** attempt * 1000);
      }
    }
    throw new FlexOrchError(
      `Request failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  async getBytes(path: string, params?: Record<string, string>): Promise<Uint8Array> {
    const url = this.url(path, params);
    const res = await this.fetchFn(url, { headers: this.defaultHeaders });
    if (!res.ok) throw await parseError(res);
    return new Uint8Array(await res.arrayBuffer());
  }

  get(path: string, params?: Record<string, string>): Promise<unknown> {
    return params ? this.doRequest("GET", path, { params }) : this.doRequest("GET", path);
  }

  post(path: string, json?: unknown): Promise<unknown> {
    return this.doRequest("POST", path, { json });
  }

  postForm(path: string, form: FormData): Promise<unknown> {
    return this.doRequest("POST", path, { form });
  }

  delete(path: string): Promise<unknown> {
    return this.doRequest("DELETE", path);
  }
}
