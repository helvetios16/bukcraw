import { describe, expect, test } from "bun:test";
import { RateLimiter } from "../../src/core/rate-limiter";

describe("RateLimiter", () => {
  test("first call resolves immediately", async () => {
    const limiter = new RateLimiter(100, 0);
    const start = Date.now();
    await limiter.throttle();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  test("second call is delayed by at least baseDelay", async () => {
    const limiter = new RateLimiter(100, 0);
    await limiter.throttle();

    const start = Date.now();
    await limiter.throttle();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  test("respects jitter range", async () => {
    const limiter = new RateLimiter(50, 50);
    await limiter.throttle();

    const start = Date.now();
    await limiter.throttle();
    const elapsed = Date.now() - start;

    // Should be at least ~baseDelay, at most ~baseDelay + jitter
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(200);
  });

  test("no delay needed if enough time has passed", async () => {
    const limiter = new RateLimiter(10, 0);
    await limiter.throttle();

    // Wait longer than the base delay
    await new Promise((r) => setTimeout(r, 30));

    const start = Date.now();
    await limiter.throttle();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(20);
  });

  test("uses default constants when no args provided", () => {
    const limiter = new RateLimiter();
    expect(limiter).toBeTruthy();
  });
});
