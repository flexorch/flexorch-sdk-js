import { vi } from "vitest";
import type { FetchFn } from "../src/transport.js";

export const BASE = "https://api.flexorch.com/v1";

// The real API wraps every /v1/* response in {status, data, error} (see
// dev-docs/api-reference.md "Standart Response Wrapper" in the flexorch
// repo). Transport unwraps this and hands resources the `data` payload —
// wrap fixtures with these so tests exercise that unwrap step for real.
export function envelope(data: unknown, status = "success", meta?: Record<string, unknown>): unknown {
  const body: Record<string, unknown> = { status, data, error: null };
  if (meta) body["meta"] = meta;
  return body;
}

export function accepted(data: unknown, meta?: Record<string, unknown>): unknown {
  return envelope(data, "accepted", meta ?? { poll: "/v1/jobs/{id}" });
}

// Use mockImplementation so each call gets a fresh Response (body can only be read once).
export function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}): FetchFn {
  return vi.fn().mockImplementation(() => {
    const isNoBody = status === 204 || body === null || body === undefined;
    return Promise.resolve(
      new Response(isNoBody ? null : JSON.stringify(body), {
        status: isNoBody ? 200 : status, // undici rejects 204 with a body; use 200 for no-content mocks
        headers: { "content-type": "application/json", ...headers },
      }),
    );
  });
}

export function mockFetchBytes(status: number, bytes: Uint8Array): FetchFn {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(bytes, { status, headers: { "content-type": "application/octet-stream" } }),
    ),
  );
}

export function mockFetchSequence(responses: Array<{ status: number; body: unknown }>): FetchFn {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }
  return fn;
}
