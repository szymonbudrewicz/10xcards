// The reviewer must be importable as a library (future promptfoo provider, M5L3):
// importing the public API may not start a review, touch the network or write output.
import { afterEach, describe, expect, it, vi } from "vitest";

describe("reviewer library", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports without side effects", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    const stderrSpy = vi.spyOn(process.stderr, "write");
    // Vitest routes console through its own worker channel, not process.stdout/stderr.
    const consoleSpies = (["log", "info", "warn", "error"] as const).map((method) => vi.spyOn(console, method));

    const api = await import("../src/index.ts");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(typeof api.runReview).toBe("function");
    expect(typeof api.createReviewer).toBe("function");
    expect(api.REVIEW_SCHEMA).toBeDefined();
  });
});
