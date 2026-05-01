/**
 * @file goodreads-service.ts
 * @description Facade service that orchestrates specialized domain services.
 */

import type { Page } from "puppeteer";
import type { BrowserClient } from "../core/browser-client";
import type { Blog, Book, BookFilterOptions, Edition } from "../types";
import { Logger } from "../utils/logger";
import { BlogService } from "./blog-service";
import { BookService } from "./book-service";
import { EditionService } from "./edition-service";
import type { EditionsFilters } from "./editions-parser";

const log = new Logger("GoodreadsService");

export class GoodreadsService {
  public readonly blog: BlogService;
  public readonly book: BookService;
  public readonly edition: EditionService;

  constructor(pageOrClient: Page | BrowserClient) {
    // Note: In the new architecture, specialized services handle their own browser page or client.
    // For backward compatibility, we pass the same client to all.
    const client = "launch" in pageOrClient ? (pageOrClient as BrowserClient) : undefined;

    this.blog = new BlogService(client);
    this.book = new BookService(client);
    this.edition = new EditionService(client);
  }

  /**
   * Delegates to BlogService.
   */
  public async scrapeBlog(id: string): Promise<Blog | null> {
    return this.blog.scrapeBlog(id);
  }

  /**
   * Delegates to BookService.
   */
  public async scrapeBook(id: string): Promise<Book | null> {
    return this.book.scrapeBook(id);
  }

  /**
   * Delegates to EditionService.
   */
  public async scrapeEditionsFilters(legacyId: string | number): Promise<EditionsFilters | null> {
    return this.edition.scrapeEditionsFilters(legacyId);
  }

  /**
   * Delegates to EditionService.
   */
  public async scrapeFilteredEditions(
    legacyId: string | number,
    options: BookFilterOptions,
  ): Promise<Edition[]> {
    return this.edition.scrapeFilteredEditions(legacyId, options);
  }

  /**
   * Prints a summary of the scraping efficiency aggregated from all services.
   */
  public printTelemetry(): void {
    const blogStats = this.blog.getTelemetry();
    const bookStats = this.book.getTelemetry();
    const editionStats = this.edition.getTelemetry();

    const totalStats = {
      httpSuccess: blogStats.httpSuccess + bookStats.httpSuccess + editionStats.httpSuccess,
      browserFallback:
        blogStats.browserFallback + bookStats.browserFallback + editionStats.browserFallback,
      cacheHits: blogStats.cacheHits + bookStats.cacheHits + editionStats.cacheHits,
      notModified: blogStats.notModified + bookStats.notModified + editionStats.notModified,
    };

    const totalRequests =
      totalStats.httpSuccess + totalStats.browserFallback + totalStats.notModified;
    const efficiency =
      totalRequests > 0 ? ((totalStats.httpSuccess / totalRequests) * 100).toFixed(1) : "0";
    const savedRequests = totalStats.notModified + totalStats.cacheHits;

    log.info("AGGREGATED TELEMETRY REPORT");
    log.info("=".repeat(40));
    log.info(`HTTP requests:        ${totalStats.httpSuccess}`);
    log.info(`304 Not Modified:     ${totalStats.notModified}`);
    log.info(`Browser fallbacks:    ${totalStats.browserFallback}`);
    log.info(`Cache hits:           ${totalStats.cacheHits}`);
    log.info("-".repeat(40));
    log.info(`HTTP success rate:    ${efficiency}%`);
    log.info(`Saved requests:       ${savedRequests} (cache + 304)`);
  }
}
