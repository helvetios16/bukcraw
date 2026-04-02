/**
 * @file goodreads-service.ts
 * @description Service responsible for navigating Goodreads and storing book information.
 */

import type { ElementHandle, Page } from "puppeteer";
import { BLOG_URL, BOOK_URL, GOODREADS_URL, WORK_URL } from "../config/constants";
import type { BrowserClient } from "../core/browser-client";
import { CacheManager } from "../core/cache-manager";
import { DatabaseService } from "../core/database";
import { HttpClient } from "../core/http-client";
import type { Blog, Book, BookFilterOptions, Edition } from "../types";
import { delay, getErrorMessage, isValidBookId } from "../utils/util";
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
  private http: HttpClient | null = null;

  // Telemetry stats
  private stats = {
    httpSuccess: 0,
    browserFallback: 0,
    cacheHits: 0,
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
      console.log("Reusing existing session from database.");
      this.http = new HttpClient(latestSession.cookies);
      return;
    }

    console.log("Session expired or missing. Fetching new cookies...");

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
      console.log("New session initialized.");
    } catch (error: unknown) {
      console.error("Critical session error:", getErrorMessage(error));
      throw new Error("SESSION_INIT_FAILURE: Could not obtain a valid Goodreads session.");
    }
  }

  private isSessionFresh(createdAt: string): boolean {
    const createdDate = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < 20;
  }

  public async scrapeBook(id: string): Promise<Book | null> {
    if (!isValidBookId(id)) {
      throw new Error(`Invalid Book ID format: ${id}`);
    }

    // 0. Check Database Cache (Level 1)
    const dbBook = this.db.getBook(id);
    if (dbBook) {
      if (this.isCacheValid(dbBook.updatedAt)) {
        console.log(`DB cache hit: book ${id}`);
        this.stats.cacheHits++;
        return dbBook;
      }
    }

    const url = `${GOODREADS_URL}${BOOK_URL}${id}`;
    console.log(`Scraping book ${id}...`);

    const fileBook = await this.tryLoadBookFromFileCache(url);
    if (fileBook) {
      return fileBook;
    }

    // 2. Hybrid fetch (Level 3)
    const { content, method } = await this.fetchContentWithFallback(url);

    let bookData: Book | null = null;

    // 3. Extract data (Next.js Data)
    if (method === "http") {
      bookData = await this.processNextDataFromHtml(content, url);
    } else if (this.page) {
      const nextDataElement = await this.page.$("#__NEXT_DATA__");
      if (nextDataElement) {
        bookData = await this.processNextDataFromElement(nextDataElement, url);
      }
    }

    if (!bookData) {
      console.warn("Failed to extract book data.");
    }

    // 4. Guardar HTML como respaldo
    await this.cache.save({ url, content, force: false, extension: ".html" });

    return bookData;
  }

  public async scrapeEditionsFilters(legacyId: string | number): Promise<void> {
    const url = `${GOODREADS_URL}${WORK_URL}${legacyId}`;
    console.log(`Scraping edition filters (Work ID: ${legacyId})...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        return;
      }
    } catch (_error: unknown) {
      // Cache miss, proceed with network fetch
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
      console.log(`Edition filters saved (${editionsData.language.length} languages found).`);
    } else {
      console.warn("Failed to parse edition filters.");
    }
  }

  public async scrapeBlog(id: string): Promise<Blog | null> {
    const url = `${GOODREADS_URL}${BLOG_URL}${id}`;
    console.log(`Scraping blog ${id}...`);

    try {
      const cachedParsed = await this.cache.get(url, "-parsed.json");
      if (cachedParsed) {
        const blogData = JSON.parse(cachedParsed) as Blog;

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
    } catch (_error: unknown) {
      // Cache miss, proceed with network fetch
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
      console.log(`Blog parsed (${blogData.mentionedBooks?.length || 0} books found).`);

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
      console.warn("Failed to parse blog content.");
    }

    return blogData;
  }

  public async scrapeFilteredEditions(
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<void> {
    const baseUrl = `${GOODREADS_URL}${WORK_URL}${legacyId}`;

    // 0. Check DB Cache
    if (this.checkEditionsDbCache(legacyId, options.language)) {
      return;
    }

    // 1. Validate filters
    await this.validateFilters(baseUrl, legacyId, options);

    // 2. Build URL
    const baseUrlWithParams = this.buildEditionsUrl(baseUrl, options);

    // 3. Process pagination
    const { allEditions, scrapedUrls, totalPages } =
      await this.processEditionsPagination(baseUrlWithParams);

    // 4. Guardar resultados
    await this.saveEditionsResults({
      baseUrl: baseUrlWithParams,
      legacyId,
      editions: allEditions,
      urls: scrapedUrls,
      totalPages,
      options,
    });
  }

  // --- Helper Methods ---

  /**
   * Hybrid content fetcher: tries HTTP first, falls back to Puppeteer if blocked.
   */
  private async fetchContentWithFallback(
    url: string,
  ): Promise<{ content: string; method: "http" | "browser" }> {
    if (!this.http) {
      await this.initSession();
    }

    try {
      const content = await this.http?.get(url);

      if (!this.http?.isBlocked(content)) {
        this.stats.httpSuccess++;
        return { content, method: "http" };
      }
    } catch (_error: unknown) {
      // HTTP failed, fall back to browser
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
   * Prints a summary of the scraping efficiency.
   */
  public printTelemetry(): void {
    const totalRequests = this.stats.httpSuccess + this.stats.browserFallback;
    const efficiency =
      totalRequests > 0 ? ((this.stats.httpSuccess / totalRequests) * 100).toFixed(1) : "0";

    console.log("TELEMETRY REPORT");
    console.log("=".repeat(40));
    console.log(`HTTP requests:        ${this.stats.httpSuccess}`);
    console.log(`Browser fallbacks:    ${this.stats.browserFallback}`);
    console.log(`Cache hits:           ${this.stats.cacheHits}`);
    console.log("-".repeat(40));
    console.log(`HTTP success rate:    ${efficiency}%`);
  }

  private async ensureBrowserPage(): Promise<void> {
    if (this.page) {
      return;
    }

    if (!this.browserClient) {
      throw new Error("BrowserClient or Page required for Puppeteer fallback.");
    }

    this.page = await this.browserClient.launch();
    this.page.setDefaultNavigationTimeout(60000);
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
      console.error("Resource not found (404).");
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
    } catch (_error: unknown) {
      // Cache read failed, proceed with network fetch
    }
    return null;
  }

  private async processNextDataFromElement(
    element: ElementHandle,
    url: string,
  ): Promise<Book | null> {
    const nextData = await this.page?.evaluate((el) => el.textContent, element);
    return this.handleNextDataJson(nextData, url);
  }

  private async processNextDataFromHtml(html: string, url: string): Promise<Book | null> {
    // Regex simple para extraer el contenido de <script id="__NEXT_DATA__">...</script>
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return this.handleNextDataJson(match ? match[1] : null, url);
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
      console.warn("Failed to process Next.js data:", getErrorMessage(e));
      return null;
    }
  }

  private checkEditionsDbCache(legacyId: string | number, language?: string): boolean {
    const dbEditions = this.db.getEditions(legacyId, language);
    const firstEdition = dbEditions?.[0];

    if (dbEditions && dbEditions.length > 0 && firstEdition) {
      // Check freshness of the first edition
      if (this.isCacheValid(firstEdition.createdAt)) {
        console.log(`DB cache hit: ${dbEditions.length} editions found.`);
        return true;
      }
    }
    return false;
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

    const validOptions = JSON.parse(cachedMetadata) as EditionsFilters;
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
    console.log(`Pagination: ${pagination.totalPages} pages total.`);

    // Next Pages
    if (pagination.totalPages > 1) {
      for (let i = 2; i <= pagination.totalPages; i++) {
        const pageUrl = `${baseUrlWithParams}&page=${i}`;
        const { content, fromCache } = await this.getPageContent(pageUrl);

        if (!fromCache) {
          await delay(2500 + Math.random() * 2500); // Respectful delay
        }

        scrapedUrls.push(pageUrl);
        const pageEditions = parseEditionsList(content);
        allEditions.push(...pageEditions);
      }
    }

    return { allEditions, scrapedUrls, totalPages: pagination.totalPages };
  }

  private async getPageContent(url: string): Promise<{ content: string; fromCache: boolean }> {
    const content = await this.cache.get(url, ".html");
    if (content) {
      return { content, fromCache: true };
    }

    const { content: freshContent } = await this.fetchContentWithFallback(url);
    await this.cache.save({ url, content: freshContent, force: true, extension: ".html" });

    return { content: freshContent, fromCache: false };
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

    console.log(`Done. ${editions.length} editions saved.`);
  }

  private isCacheValid(dateStr?: string): boolean {
    if (!dateStr) {
      return false;
    }
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 10;
  }
}
