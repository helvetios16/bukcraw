import type { Page } from "puppeteer";
import { GOODREADS_URL, NAVIGATION_TIMEOUT_MS, SESSION_TTL_MINUTES } from "../config/constants";
import type { BrowserClient } from "../core/browser-client";
import { CacheManager } from "../core/cache-manager";
import { DatabaseService } from "../core/database";
import { HttpClient } from "../core/http-client";
import { RateLimiter } from "../core/rate-limiter";
import { Logger } from "../utils/logger";
import { getErrorMessage, hashUrl } from "../utils/util";

const log = new Logger("BaseScraperService");

export interface ScraperStats {
  httpSuccess: number;
  browserFallback: number;
  cacheHits: number;
  notModified: number;
}

export abstract class BaseScraperService {
  protected page: Page | null = null;
  protected http: HttpClient | null = null;
  protected readonly cache = new CacheManager();
  protected readonly db = new DatabaseService();
  protected readonly rateLimiter = new RateLimiter();

  protected stats: ScraperStats = {
    httpSuccess: 0,
    browserFallback: 0,
    cacheHits: 0,
    notModified: 0,
  };

  constructor(protected readonly browserClient?: BrowserClient) {}

  public async initSession(): Promise<void> {
    const latestSession = this.db.getLatestSession();

    if (latestSession && this.isSessionFresh(latestSession.createdAt)) {
      log.debug("Reusing existing session from database.");
      this.http = new HttpClient(latestSession.cookies);
      return;
    }

    log.info("Session expired or missing. Fetching new cookies...");

    try {
      await this.ensureBrowserPage();
      if (!this.page) {
        throw new Error("Failed to start browser.");
      }

      await this.page.goto(GOODREADS_URL, { waitUntil: "domcontentloaded" });

      const cookiesArr = await this.page.cookies();
      const cookiesStr = cookiesArr.map((c) => `${c.name}=${c.value}`).join("; ");

      if (!cookiesStr) {
        throw new Error("No cookies obtained from browser.");
      }

      this.db.saveSession(cookiesStr);
      this.http = new HttpClient(cookiesStr);
      log.info("New session initialized.");
    } catch (error: unknown) {
      log.error("Critical session error:", getErrorMessage(error));
      throw new Error("SESSION_INIT_FAILURE: Could not obtain a valid Goodreads session.");
    }
  }

  private isSessionFresh(createdAt: string): boolean {
    const createdDate = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < SESSION_TTL_MINUTES;
  }

  protected async fetchContentWithFallback(
    url: string,
  ): Promise<{ content: string; method: "http" | "browser" | "not-modified" }> {
    if (!this.http) {
      await this.initSession();
    }
    await this.rateLimiter.throttle();

    try {
      const urlHash = hashUrl(url);
      const metadata = this.db.getHttpMetadata(urlHash);

      if (metadata && (metadata.etag || metadata.lastModified)) {
        const condResponse = await this.http?.conditionalGet(url, {
          etag: metadata.etag,
          lastModified: metadata.lastModified,
        });

        if (condResponse?.notModified) {
          const cached =
            (await this.cache.get(url, ".json")) || (await this.cache.get(url, ".html"));
          if (cached) {
            this.stats.notModified++;
            this.db.refreshHttpMetadata(urlHash);
            return { content: cached, method: "not-modified" };
          }
        }

        if (condResponse?.content && !this.http?.isBlocked(condResponse.content)) {
          this.stats.httpSuccess++;
          this.db.saveHttpMetadata(urlHash, url, condResponse.etag, condResponse.lastModified);
          return { content: condResponse.content, method: "http" };
        }
      }

      const content = await this.http?.get(url);
      if (content && !this.http?.isBlocked(content)) {
        this.stats.httpSuccess++;
        this.saveMetadataFromUrl(url);
        return { content, method: "http" };
      }
    } catch (error: unknown) {
      log.debug("HTTP fetch failed, falling back to browser:", getErrorMessage(error));
    }

    this.stats.browserFallback++;
    await this.ensureBrowserPage();
    if (!this.page) {
      throw new Error("Failed to initialize Puppeteer for fallback.");
    }

    await this.navigateTo(url);
    const content = await this.page.content();
    return { content, method: "browser" };
  }

  private async saveMetadataFromUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.http ? "bukcraw" : "" },
      });
      const etag = response.headers.get("ETag") || undefined;
      const lastModified = response.headers.get("Last-Modified") || undefined;
      if (etag || lastModified) {
        this.db.saveHttpMetadata(hashUrl(url), url, etag, lastModified);
      }
    } catch {}
  }

  protected async ensureBrowserPage(): Promise<void> {
    if (this.page) {
      return;
    }
    if (!this.browserClient) {
      throw new Error("BrowserClient or Page required for Puppeteer fallback.");
    }
    this.page = await this.browserClient.launch();
    this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  }

  protected async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Page instance is missing.");
    }
    const response = await this.page.goto(url, { waitUntil: "domcontentloaded" });
    if (!response) {
      throw new Error("No response received from browser.");
    }
    const status = response.status();
    if (status === 404) {
      return;
    }
    if (status === 403 || status === 429) {
      throw new Error(`Access denied or rate limited (Status: ${status}).`);
    }

    const currentUrl = this.page.url();
    if (currentUrl.includes("/user/sign_in") || currentUrl.includes("captcha")) {
      throw new Error("Redirected to login or captcha page. Manual intervention required.");
    }
    await this.page.waitForSelector("body");
  }

  public getTelemetry(): ScraperStats {
    return this.stats;
  }
}
