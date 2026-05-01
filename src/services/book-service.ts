import type { ElementHandle } from "puppeteer";
import { BOOK_URL, CACHE_TTL_DAYS, GOODREADS_URL } from "../config/constants";
import type { Book } from "../types";
import { Logger } from "../utils/logger";
import { getErrorMessage, isValidBookId } from "../utils/util";
import { BaseScraperService } from "./base-scraper";
import { parseBookData } from "./book-parser";

const log = new Logger("BookService");

export class BookService extends BaseScraperService {
  /**
   * Scrapes book details from Goodreads.
   */
  public async scrapeBook(id: string): Promise<Book | null> {
    if (!isValidBookId(id)) {
      throw new Error(`Invalid Book ID format: ${id}`);
    }

    // 1. Check Database Cache
    const dbBook = this.db.getBook(id);
    if (dbBook && this.isCacheValid(dbBook.updatedAt)) {
      this.stats.cacheHits++;
      return dbBook;
    }

    const url = `${GOODREADS_URL}${BOOK_URL}${id}`;
    log.info(`Scraping book ${id}...`);

    // 2. Try File Cache
    const fileBook = await this.tryLoadBookFromFileCache(url);
    if (fileBook) {
      return fileBook;
    }

    // 3. Fetch Content
    const { content, method } = await this.fetchContentWithFallback(url);

    if (method === "not-modified" && dbBook) {
      this.db.refreshBookTimestamp(id);
      return dbBook;
    }

    let bookData: Book | null = null;

    if (method === "http" || method === "not-modified") {
      bookData = await this.processNextDataFromHtml(content, url);
    } else if (this.page) {
      const nextDataElement = await this.page.$("#__NEXT_DATA__");
      if (nextDataElement) {
        bookData = await this.processNextDataFromElement(nextDataElement, url);
      }
    }

    await this.cache.save({ url, content, force: false, extension: ".html" });
    return bookData;
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

  private async processNextDataFromHtml(html: string, url: string): Promise<Book | null> {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return this.handleNextDataJson(match?.[1] ?? null, url);
  }

  private async processNextDataFromElement(
    element: ElementHandle,
    url: string,
  ): Promise<Book | null> {
    const nextData = await this.page?.evaluate((el) => el.textContent, element);
    return this.handleNextDataJson(nextData ?? null, url);
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
