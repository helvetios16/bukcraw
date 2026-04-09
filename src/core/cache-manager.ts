/**
 * @file cache-manager.ts
 * @description Manages local file caching for scraped content to reduce network requests.
 */

import { mkdirSync } from "node:fs";
import { FILE_CACHE_LOOKBACK_DAYS } from "../config/constants";
import { hashUrl, isValidUrl } from "../utils/util";

export interface CacheSaveOptions {
  url: string;
  content: string;
  force?: boolean;
  extension?: string;
}

export class CacheManager {
  readonly cacheDir: string;

  constructor(cacheDir: string = "./cache") {
    this.cacheDir = cacheDir;
    mkdirSync(this.cacheDir, { recursive: true });
  }

  public async has(url: string): Promise<boolean> {
    for (let i = 0; i < FILE_CACHE_LOOKBACK_DAYS; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const type = this.getContentType(url);
      const filename = `${this.cacheDir}/${dateStr}/${type}/${hashUrl(url)}.html`;
      const file = Bun.file(filename);

      if (await file.exists()) {
        return true;
      }
    }
    return false;
  }

  public async get(url: string, extension: string = ".html"): Promise<string | undefined> {
    for (let i = 0; i < FILE_CACHE_LOOKBACK_DAYS; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const type = this.getContentType(url);
      const filename = `${this.cacheDir}/${dateStr}/${type}/${hashUrl(url)}${extension}`;
      const file = Bun.file(filename);

      if (await file.exists()) {
        return await file.text();
      }
    }

    return undefined;
  }

  public async save({
    url,
    content,
    force = false,
    extension = ".html",
  }: CacheSaveOptions): Promise<string> {
    const filename = this.getCacheFilePath(url, extension);
    const file = Bun.file(filename);

    if (!force && (await file.exists())) {
      return filename;
    }

    await Bun.write(file, content);

    return filename;
  }

  /**
   * Atomically gets cached content or fetches it via the provided function.
   * Eliminates the TOCTOU race condition between has()/get() and save().
   */
  public async getOrFetch(
    url: string,
    fetcher: () => Promise<string>,
    extension: string = ".html",
  ): Promise<{ content: string; fromCache: boolean }> {
    const cached = await this.get(url, extension);
    if (cached) {
      return { content: cached, fromCache: true };
    }

    const content = await fetcher();
    await this.save({ url, content, force: true, extension });
    return { content, fromCache: false };
  }

  private getDayDir(): string {
    const date = new Date().toISOString().split("T")[0];
    return `${this.cacheDir}/${date}`;
  }

  private getContentType(url: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("/book/")) {
      return "books";
    }
    if (lowerUrl.includes("/author/")) {
      return "authors";
    }
    if (lowerUrl.includes("/blog/")) {
      return "blog";
    }
    return "misc";
  }

  private getCacheFilePath(url: string, extension: string = ".html"): string {
    if (!isValidUrl(url)) {
      throw new Error(`Invalid URL provided to cache: ${url}`);
    }

    const type = this.getContentType(url);
    const dir = `${this.getDayDir()}/${type}`;

    mkdirSync(dir, { recursive: true });

    return `${dir}/${hashUrl(url)}${extension}`;
  }
}
