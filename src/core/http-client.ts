// src/core/http-client.ts

import { USER_AGENT } from "../config/constants";

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
  private readonly defaultHeaders: HttpHeaders = {
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

  /**
   * Performs a GET request and returns the response body as text.
   * @param url - The target URL.
   * @param options - Optional request configuration.
   * @returns The response body as a string.
   */
  public async get(url: string, options?: RequestOptions): Promise<string> {
    const headers = { ...this.defaultHeaders, ...options?.headers };

    try {
      const response = await fetch(url, {
        method: options?.method ?? "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText} at ${url}`);
      }

      return await response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch ${url}: ${message}`);
    }
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
