/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { ElementHandle, Page } from "puppeteer";
import {
  BLOG_URL,
  BOOK_URL,
  CACHE_TTL_DAYS,
  GOODREADS_URL,
  NAVIGATION_TIMEOUT_MS,
  SESSION_TTL_MINUTES,
  WORK_URL,
} from "../config/constants";
import type { BrowserClient } from "../core/browser-client";
import { CacheManager } from "../core/cache-manager";
import { DatabaseService } from "../core/database";
import { HttpClient } from "../core/http-client";
import { RateLimiter } from "../core/rate-limiter";
import {
  type Blog,
  type Book,
  type BookFilterOptions,
  type Edition,
  isBlog,
  isEditionsFilters,
} from "../types";
import { pMap } from "../utils/concurrency";
import { Logger } from "../utils/logger";
import { getErrorMessage, hashUrl, isValidBookId } from "../utils/util";

const log = new Logger("GoodreadsService");

import { parseBlogHtml } from "./blog-parser";
import { parseBookData } from "./book-parser";
import {
  type EditionsFilters,
  extractPaginationInfo,
  parseEditionsHtml,
  parseEditionsList,
} from "./editions-parser";

interface SaveEditionsParams {
  baseUrl: string;
  legacyId: string | number;
  editions: Edition[];
  urls: string[];
  totalPages: number;
  options: BookFilterOptions;
}

export class GoodreadsService {
  private page: Page | null = null;
  private readonly browserClient?: BrowserClient;
  private readonly cache = new CacheManager();
  private readonly db = new DatabaseService();
  private readonly rateLimiter = new RateLimiter();
  private http: HttpClient | null = null;

  // Telemetry stats
  private stats = {
    httpSuccess: 0,
    browserFallback: 0,
    cacheHits: 0,
    notModified: 0,
  };

  constructor(pageOrClient: Page | BrowserClient) {
    if ("launch" in pageOrClient) {
      this.browserClient = pageOrClient;
    } else {
      this.page = pageOrClient;
    }
  }

  /**
   * Initializes the service by ensuring a valid session (cookies) is available.
   * If no valid session exists (< 20 mins), it launches the browser to get one.
   */
  public async initSession(): Promise<void> {
    const latestSession = this.db.getLatestSession();

    if (latestSession && this.isSessionFresh(latestSession.createdAt)) {
      log.info("Reusing existing session from database.");
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

  public async scrapeBook(id: string): Promise<Book | null> {
    if (!isValidBookId(id)) {
      throw new Error(`Invalid Book ID format: ${id}`);
    }

    // 0. Check Database Cache (Level 1)
    const dbBook = this.db.getBook(id);
    if (dbBook) {
      if (this.isCacheValid(dbBook.updatedAt)) {
        log.debug(`DB cache hit: book ${id}`);
        this.stats.cacheHits++;
        return dbBook;
      }
    }

    const url = `${GOODREADS_URL}${BOOK_URL}${id}`;
    log.info(`Scraping book ${id}...`);

    const fileBook = await this.tryLoadBookFromFileCache(url);
    if (fileBook) {
      return fileBook;
    }

    // 2. Hybrid fetch (Level 3)
    const { content, method } = await this.fetchContentWithFallback(url);

    // 2b. 304 Not Modified — reuse existing DB/file data
    if (method === "not-modified") {
      if (dbBook) {
        this.db.refreshBookTimestamp(id);
        log.info(`Book ${id} not modified, reusing cached data.`);
        return dbBook;
      }
      // Try to re-parse from the cached content that was returned
    }

    let bookData: Book | null = null;

    // 3. Extract data (Next.js Data)
    if (method === "http" || method === "not-modified") {
      bookData = await this.processNextDataFromHtml(content, url);
    } else if (this.page) {
      const nextDataElement = await this.page.$("#__NEXT_DATA__");
      if (nextDataElement) {
        bookData = await this.processNextDataFromElement(nextDataElement, url);
      }
    }

    if (!bookData) {
      log.warn("Failed to extract book data.");
    }

    // 4. Guardar HTML como respaldo
    await this.cache.save({ url, content, force: false, extension: ".html" });

    return bookData;
  }

  public async scrapeEditionsFilters(legacyId: string | number): Promise<void> {
    const url = `${GOODREADS_URL}${WORK_URL}${legacyId}`;
    log.info(`Scraping edition filters (Work ID: ${legacyId})...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        return;
      }
    } catch (error: unknown) {
      log.debug("Edition filters cache miss:", getErrorMessage(error));
    }

    const { content } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content, force: false, extension: ".html" });

    const editionsData = parseEditionsHtml(content);

    if (editionsData) {
      const jsonContent = JSON.stringify(editionsData, null, 2);
      await this.cache.save({
        url,
        content: jsonContent,
        force: true,
        extension: "-parsed.json",
      });
      log.info(`Edition filters saved (${editionsData.language.length} languages found).`);
    } else {
      log.warn("Failed to parse edition filters.");
    }
  }

  public async scrapeBlog(id: string): Promise<Blog | null> {
    const url = `${GOODREADS_URL}${BLOG_URL}${id}`;
    log.info(`Scraping blog ${id}...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        const parsed: unknown = JSON.parse(cachedParsed);
        if (!isBlog(parsed)) {
          log.warn("Cached blog data is invalid, re-fetching...");
          throw new Error("Invalid cached blog data");
        }
        const blogData = parsed;

        if (blogData?.mentionedBooks) {
          for (const book of blogData.mentionedBooks) {
            this.db.saveBlogReference({
              blogId: id,
              bookId: book.id,
              blogTitle: blogData.title,
              blogUrl: blogData.webUrl,
            });
          }
        }
        return blogData;
      }
    } catch (error: unknown) {
      log.debug("Blog cache miss:", getErrorMessage(error));
    }

    const { content } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content, force: false, extension: ".html" });

    const blogData = parseBlogHtml(content, url);

    if (blogData) {
      const jsonContent = JSON.stringify(blogData, null, 2);
      await this.cache.save({
        url,
        content: jsonContent,
        force: true,
        extension: "-parsed.json",
      });
      log.info(`Blog parsed (${blogData.mentionedBooks?.length || 0} books found).`);

      if (blogData.mentionedBooks) {
        for (const book of blogData.mentionedBooks) {
          this.db.saveBlogReference({
            blogId: id,
            bookId: book.id,
            blogTitle: blogData.title,
            blogUrl: blogData.webUrl,
          });
        }
      }
    } else {
      log.warn("Failed to parse blog content.");
    }

    return blogData;
  }

  public async scrapeFilteredEditions(
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<Edition[]> {
    const baseUrl = `${GOODREADS_URL}${WORK_URL}${legacyId}`;

    // 0. Check DB Cache
    const dbEditions = this.getEditionsFromDbCache(legacyId, options.language);
    if (dbEditions) {
      return dbEditions;
    }

    // 1. Validate filters
    await this.validateFilters(baseUrl, legacyId, options);

    // 2. Build URL
    const baseUrlWithParams = this.buildEditionsUrl(baseUrl, options);

    // 3. Process pagination
    const { allEditions, scrapedUrls, totalPages } =
      await this.processEditionsPagination(baseUrlWithParams);

    // 4. Save results
    await this.saveEditionsResults({
      baseUrl: baseUrlWithParams,
      legacyId,
      editions: allEditions,
      urls: scrapedUrls,
      totalPages,
      options,
    });

    return allEditions;
  }

  // --- Helper Methods ---

  /**
   * Hybrid content fetcher: tries conditional GET first (ETag/Last-Modified),
   * then full HTTP, then falls back to Puppeteer if blocked.
   *
   * When the server returns 304 Not Modified, the cached content is reused
   * and timestamps are refreshed — saving bandwidth and processing time.
   */
  private async fetchContentWithFallback(
    url: string,
  ): Promise<{ content: string; method: "http" | "browser" | "not-modified" }> {
    if (!this.http) {
      await this.initSession();
    }

    await this.rateLimiter.throttle();

    try {
      // 1. Try conditional GET if we have stored metadata
      const urlHash = hashUrl(url);
      const metadata = this.db.getHttpMetadata(urlHash);

      if (metadata && (metadata.etag || metadata.lastModified)) {
        const condResponse = await this.http?.conditionalGet(url, {
          etag: metadata.etag,
          lastModified: metadata.lastModified,
        });

        if (condResponse?.notModified) {
          // Resource hasn't changed — try to serve from cache
          const cached =
            (await this.cache.get(url, ".json")) || (await this.cache.get(url, ".html"));

          if (cached) {
            this.stats.notModified++;
            this.db.refreshHttpMetadata(urlHash);
            log.debug(`304 Not Modified: ${url}`);
            return { content: cached, method: "not-modified" };
          }
          // 304 but no local cache — fall through to full fetch
          log.debug("304 but no local cache, doing full fetch");
        }

        // Conditional request returned new content (200)
        if (condResponse?.content && !this.http?.isBlocked(condResponse.content)) {
          this.stats.httpSuccess++;
          this.db.saveHttpMetadata(urlHash, url, condResponse.etag, condResponse.lastModified);
          return { content: condResponse.content, method: "http" };
        }
      }

      // 2. Full HTTP request (no metadata or conditional failed)
      const content = await this.http?.get(url);

      if (content && !this.http?.isBlocked(content)) {
        this.stats.httpSuccess++;
        // Extract and save metadata from response headers for future conditional requests
        // (headers are captured in conditionalGet; for plain get we do a lightweight HEAD)
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

  /**
   * Performs a lightweight HEAD request to capture ETag/Last-Modified
   * after a successful full GET (which doesn't expose response headers).
   */
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
    } catch {
      // Best-effort, don't fail the main flow
    }
  }

  /**
   * Prints a summary of the scraping efficiency.
   */
  public printTelemetry(): void {
    const totalRequests =
      this.stats.httpSuccess + this.stats.browserFallback + this.stats.notModified;
    const efficiency =
      totalRequests > 0 ? ((this.stats.httpSuccess / totalRequests) * 100).toFixed(1) : "0";
    const savedRequests = this.stats.notModified + this.stats.cacheHits;

    log.info("TELEMETRY REPORT");
    log.info("=".repeat(40));
    log.info(`HTTP requests:        ${this.stats.httpSuccess}`);
    log.info(`304 Not Modified:     ${this.stats.notModified}`);
    log.info(`Browser fallbacks:    ${this.stats.browserFallback}`);
    log.info(`Cache hits:           ${this.stats.cacheHits}`);
    log.info("-".repeat(40));
    log.info(`HTTP success rate:    ${efficiency}%`);
    log.info(`Saved requests:       ${savedRequests} (cache + 304)`);
  }

  private async ensureBrowserPage(): Promise<void> {
    if (this.page) {
      return;
    }

    if (!this.browserClient) {
      throw new Error("BrowserClient or Page required for Puppeteer fallback.");
    }

    this.page = await this.browserClient.launch();
    this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  }

  private async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Page instance is missing.");
    }

    const response = await this.page.goto(url, { waitUntil: "domcontentloaded" });

    if (!response) {
      throw new Error("No response received from browser.");
    }

    const status = response.status();
    if (status === 404) {
      log.error("Resource not found (404).");
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

  private async tryLoadBookFromFileCache(url: string): Promise<Book | null> {
    try {
      const cachedData = await this.cache.get(url, ".json");
      if (cachedData) {
        this.stats.cacheHits++;
        const book = parseBookData(JSON.parse(cachedData));
        if (book) {
          this.db.saveBook(book);
          return book;
        }
      }
    } catch (error: unknown) {
      log.debug("File cache read failed:", getErrorMessage(error));
    }
    return null;
  }

  private async processNextDataFromElement(
    element: ElementHandle,
    url: string,
  ): Promise<Book | null> {
    const nextData = await this.page?.evaluate((el) => el.textContent, element);
    return this.handleNextDataJson(nextData ?? null, url);
  }

  private async processNextDataFromHtml(html: string, url: string): Promise<Book | null> {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return this.handleNextDataJson(match?.[1] ?? null, url);
  }

  private async handleNextDataJson(jsonStr: string | null, url: string): Promise<Book | null> {
    if (!jsonStr) {
      return null;
    }

    try {
      const parsedJson = JSON.parse(jsonStr);
      await this.cache.save({
        url,
        content: JSON.stringify(parsedJson, null, 2),
        force: false,
        extension: ".json",
      });

      const bookData = parseBookData(parsedJson);
      if (bookData) {
        this.db.saveBook(bookData);
      }
      return bookData;
    } catch (e: unknown) {
      log.warn("Failed to process Next.js data:", getErrorMessage(e));
      return null;
    }
  }

  private getEditionsFromDbCache(legacyId: string | number, language?: string): Edition[] | null {
    const dbEditions = this.db.getEditions(legacyId, language);
    const firstEdition = dbEditions?.[0];

    if (dbEditions && dbEditions.length > 0 && firstEdition) {
      if (this.isCacheValid(firstEdition.createdAt)) {
        log.debug(`DB cache hit: ${dbEditions.length} editions found.`);
        return dbEditions;
      }
    }
    return null;
  }

  private async validateFilters(
    baseUrl: string,
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<void> {
    const cachedMetadata = await this.cache.get(baseUrl, "-parsed.json");
    if (!cachedMetadata) {
      throw new Error(
        `No edition metadata found for ID ${legacyId}. Run 'scrapeEditionsFilters' first.`,
      );
    }

    const parsedOptions: unknown = JSON.parse(cachedMetadata);
    if (!isEditionsFilters(parsedOptions)) {
      throw new Error(
        `Cached edition metadata for ID ${legacyId} is corrupted. Delete cache and run 'scrapeEditionsFilters' again.`,
      );
    }
    const validOptions = parsedOptions as EditionsFilters;
    const { sort, format, language } = options;

    if (sort && !validOptions.sort.some((s) => s.value === sort)) {
      throw new Error(`Invalid sort option: '${sort}'.`);
    }
    if (format && !validOptions.format.some((f) => f.value === format)) {
      throw new Error(`Invalid format: '${format}'.`);
    }
    if (language && !validOptions.language.some((l) => l.value === language)) {
      throw new Error(`Invalid language: '${language}'.`);
    }
  }

  private buildEditionsUrl(baseUrl: string, options: BookFilterOptions): string {
    const query = new URLSearchParams();
    query.append("utf8", "✓");
    if (options.sort) {
      query.append("sort", options.sort);
    }
    if (options.format) {
      query.append("filter_by_format", options.format);
    }
    if (options.language) {
      query.append("filter_by_language", options.language);
    }
    return `${baseUrl}?${query.toString()}`;
  }

  private async processEditionsPagination(baseUrlWithParams: string) {
    const scrapedUrls: string[] = [];
    const allEditions: Edition[] = [];

    // Page 1
    const { content: page1Content } = await this.getPageContent(baseUrlWithParams);
    scrapedUrls.push(baseUrlWithParams);

    const page1Editions = parseEditionsList(page1Content);
    allEditions.push(...page1Editions);

    const pagination = extractPaginationInfo(page1Content);
    log.info(`Pagination: ${pagination.totalPages} total pages.`);

    // Next Pages - Parallel fetch
    if (pagination.totalPages > 1) {
      const pageUrls = Array.from(
        { length: pagination.totalPages - 1 },
        (_, i) => `${baseUrlWithParams}&page=${i + 2}`,
      );

      const results = await pMap(
        pageUrls,
        async (pageUrl) => {
          const { content } = await this.getPageContent(pageUrl);
          const editions = parseEditionsList(content);
          return { pageUrl, editions };
        },
        3, // concurrency limit
      );

      for (const result of results) {
        scrapedUrls.push(result.pageUrl);
        allEditions.push(...result.editions);
      }
    }

    return { allEditions, scrapedUrls, totalPages: pagination.totalPages };
  }

  private async getPageContent(url: string): Promise<{ content: string; fromCache: boolean }> {
    return this.cache.getOrFetch(
      url,
      async () => {
        const { content } = await this.fetchContentWithFallback(url);
        return content;
      },
      ".html",
    );
  }

  private async saveEditionsResults(params: SaveEditionsParams): Promise<void> {
    const { baseUrl, legacyId, editions, urls, totalPages, options } = params;

    await this.cache.save({
      url: baseUrl,
      content: JSON.stringify(editions, null, 2),
      force: true,
      extension: "-editions.json",
    });

    if (editions.length > 0) {
      this.db.deleteEditions(legacyId, options.language);
      this.db.saveEditions(legacyId, editions);
    }

    const metadata = {
      timestamp: new Date().toISOString(),
      legacyId,
      filters: options,
      stats: {
        totalPages,
        scrapedUrls: urls,
        totalEditions: editions.length,
      },
    };

    await this.cache.save({
      url: baseUrl,
      content: JSON.stringify(metadata, null, 2),
      force: true,
      extension: "-filter-meta.json",
    });

    log.info(`Done. ${editions.length} editions saved.`);
  }

  private isCacheValid(dateStr?: string): boolean {
    if (!dateStr) {
      return false;
    }
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= CACHE_TTL_DAYS;
  }
}
