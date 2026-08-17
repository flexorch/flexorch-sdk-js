import { describe, it, expect } from "vitest";
import { Transport, unwrap } from "../src/transport.js";
import { AuthError } from "../src/errors.js";
import { mockFetch, envelope, accepted, BASE } from "./helpers.js";

describe("unwrap", () => {
  it("strips the standard envelope", () => {
    expect(unwrap({ status: "success", data: { id: "j1" }, error: null })).toEqual({ id: "j1" });
  });

  it("strips the accepted envelope with meta", () => {
    expect(unwrap({ status: "accepted", data: { job_id: 1 }, error: null, meta: { poll: "/v1/jobs/1" } })).toEqual({
      job_id: 1,
    });
  });

  it("handles null data", () => {
    expect(unwrap({ status: "success", data: null, error: null })).toBeNull();
  });

  it("handles list data", () => {
    expect(unwrap({ status: "success", data: [1, 2, 3], error: null })).toEqual([1, 2, 3]);
  });

  it("leaves non-envelope objects alone", () => {
    // Defensive fallback — a value missing "error" or "status" isn't the
    // standard wrapper, so it's returned as-is rather than guessed at.
    expect(unwrap({ foo: "bar" })).toEqual({ foo: "bar" });
  });

  it("leaves primitives alone", () => {
    expect(unwrap(null)).toBeNull();
    expect(unwrap("plain string")).toBe("plain string");
  });
});

describe("Transport", () => {
  it("get() unwraps a real response shape", async () => {
    const t = new Transport(
      "fx_test",
      BASE,
      30,
      1,
      mockFetch(200, envelope({ job_id: "j1", status: "completed" })),
    );
    const result = await t.get("/jobs/j1");
    expect(result).toEqual({ job_id: "j1", status: "completed" });
  });

  it("get() unwraps an accepted response shape", async () => {
    const t = new Transport(
      "fx_test",
      BASE,
      30,
      1,
      mockFetch(202, accepted({ job_id: 1, status: "queued" })),
    );
    const result = await t.get("/jobs/1");
    expect(result).toEqual({ job_id: 1, status: "queued" });
  });

  it("401 raises AuthError without needing to unwrap the error body", async () => {
    const t = new Transport(
      "fx_test",
      BASE,
      1,
      1,
      mockFetch(401, { error: { code: "INVALID_API_KEY", message: "bad key" } }),
    );
    await expect(t.get("/jobs/j1")).rejects.toBeInstanceOf(AuthError);
  });
});
