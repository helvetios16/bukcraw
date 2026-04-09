/**
 * @file rate-limiter.ts
 * @description Centralized rate limiter that ensures a minimum interval between requests.
 */

import { SCRAPING_DELAY_BASE_MS, SCRAPING_DELAY_JITTER_MS } from "../config/constants";
import { delay } from "../utils/util";

export class RateLimiter {
  private lastRequestTime = 0;
  private readonly baseDelay: number;
  private readonly jitter: number;

  constructor(baseDelay = SCRAPING_DELAY_BASE_MS, jitter = SCRAPING_DELAY_JITTER_MS) {
    this.baseDelay = baseDelay;
    this.jitter = jitter;
  }

  /**
   * Waits until enough time has passed since the last request.
   * Adds random jitter to avoid predictable request patterns.
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const requiredDelay = this.baseDelay + Math.random() * this.jitter;

    if (elapsed < requiredDelay) {
      await delay(requiredDelay - elapsed);
    }

    this.lastRequestTime = Date.now();
  }
}
