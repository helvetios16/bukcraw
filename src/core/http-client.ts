// src/core/http-client.ts

import {
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRIES,
  RETRYABLE_STATUS_CODES,
  RETRY_BACKOFF_MULTIPLIER,
  USER_AGENT,
} from "../config/constants";
import { delay } from "../utils/util";

/**
 * Interface for custom HTTP headers.
 */
interface HttpHeaders {
  readonly [key: string]: string;
}

/**
 * Options for the HTTP request.
 */
interface RequestOptions {
  readonly headers?: HttpHeaders;
  readonly method?: "GET" | "POST";
}

/**
 * A lightweight HTTP client using Bun's fetch API.
 * Optimized for scraping Goodreads by mimicking browser headers.
 */
export class HttpClient {
  private readonly cookies: string;
  private readonly defaultHeaders: HttpHeaders;

  constructor(cookies = "") {
    this.cookies = cookies;
    this.defaultHeaders = {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,webp,application/json,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      Referer: "https://www.google.com/",
    };

    if (this.cookies) {
      this.defaultHeaders.Cookie = this.cookies;
    }
  }

  /**
   * Performs a GET request with automatic retry and exponential backoff.
   * Retries on transient errors (429, 5xx) with jitter to avoid thundering herd.
   * @param url - The target URL.
   * @param options - Optional request configuration.
   * @returns The response body as a string.
   */
  public async get(url: string, options?: RequestOptions): Promise<string> {
    const headers = { ...this.defaultHeaders, ...options?.headers };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: options?.method ?? "GET",
          headers,
        });

        if (!response.ok) {
          const status = response.status;
          if (attempt < MAX_RETRIES && RETRYABLE_STATUS_CODES.includes(status as 429 | 500 | 502 | 503 | 504)) {
            const retryAfter = response.headers.get("Retry-After");
            const backoff = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** attempt * (0.5 + Math.random());
            await delay(backoff);
            continue;
          }
          throw new Error(`HTTP Error: ${status} ${response.statusText} at ${url}`);
        }

        return await response.text();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          const backoff = INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** attempt * (0.5 + Math.random());
          await delay(backoff);
        }
      }
    }

    throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries: ${lastError?.message}`);
  }

  /**
   * Checks if the content indicates a CAPTCHA or bot detection.
   * @param html - The HTML content to analyze.
   * @returns True if a CAPTCHA or block is detected.
   */
  public isBlocked(html: string): boolean {
    const lowerHtml = html.toLowerCase();
    return (
      lowerHtml.includes("captcha") ||
      lowerHtml.includes("robot") ||
      lowerHtml.includes("verify you are a human") ||
      lowerHtml.includes("hcaptcha") ||
      lowerHtml.includes("recaptcha")
    );
  }
}
