/**
 * @file cache-manager.ts
 * @description Manages local file caching for scraped content to reduce network requests.
 */

import { mkdirSync } from "node:fs";
import { FILE_CACHE_LOOKBACK_DAYS } from "../config/constants";
import { hashUrl, isValidUrl } from "../utils/util";

const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface MemoryCacheEntry {
  content: string;
  expiresAt: number;
}

export interface CacheSaveOptions {
  url: string;
  content: string;
  force?: boolean;
  extension?: string;
}

export class CacheManager {
  readonly cacheDir: string;
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly memoryCacheMaxSize = 200;

  constructor(cacheDir: string = "./cache") {
    this.cacheDir = cacheDir;
    mkdirSync(this.cacheDir, { recursive: true });
  }

  public async has(url: string): Promise<boolean> {
    const cacheKey = `has:${url}`;
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return true;
    }

    for (let i = 0; i < FILE_CACHE_LOOKBACK_DAYS; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const type = this.getContentType(url);
      const filename = `${this.cacheDir}/${dateStr}/${type}/${hashUrl(url)}.html`;
      const file = Bun.file(filename);

      if (await file.exists()) {
        this.memoryCache.set(cacheKey, {
          content: "exists",
          expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
        });
        this.pruneMemoryCache();
        return true;
      }
    }
    return false;
  }

  public async get(url: string, extension: string = ".html"): Promise<string | undefined> {
    const cacheKey = `get:${url}:${extension}`;
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.content;
    }

    for (let i = 0; i < 2; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const type = this.getContentType(url);
      const filename = `${this.cacheDir}/${dateStr}/${type}/${hashUrl(url)}${extension}`;
      const file = Bun.file(filename);

      if (await file.exists()) {
        const content = await file.text();
        this.memoryCache.set(cacheKey, { content, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
        this.pruneMemoryCache();
        return content;
      }
    }

    return undefined;
  }

  private pruneMemoryCache(): void {
    if (this.memoryCache.size > this.memoryCacheMaxSize) {
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toRemove = entries.slice(0, Math.floor(this.memoryCacheMaxSize / 2));
      for (const [key] of toRemove) {
        this.memoryCache.delete(key);
      }
    }
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
      const cacheKey = `get:${url}:${extension}`;
      this.memoryCache.set(cacheKey, { content, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
      return filename;
    }

    await Bun.write(file, content);

    const cacheKey = `get:${url}:${extension}`;
    this.memoryCache.set(cacheKey, { content, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
    this.pruneMemoryCache();

    return filename;
  }

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
