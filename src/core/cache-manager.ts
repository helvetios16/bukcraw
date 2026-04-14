/**
 * @file cache-manager.ts
 * @description Manages local file caching for scraped content to reduce network requests.
 * HTML files are stored gzip-compressed (.html.gz) to reduce disk usage ~85-90%.
 * Old cache directories beyond FILE_CACHE_LOOKBACK_DAYS are auto-purged on startup.
 */

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { FILE_CACHE_LOOKBACK_DAYS } from "../config/constants";
import { hashUrl, isValidUrl } from "../utils/util";

const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const COMPRESSIBLE_EXTENSIONS = new Set([".html"]);

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
    this.purgeOldCacheDirs();
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
      const hash = hashUrl(url);

      // Check both compressed and legacy uncompressed
      const gzFile = Bun.file(`${this.cacheDir}/${dateStr}/${type}/${hash}.html.gz`);
      const plainFile = Bun.file(`${this.cacheDir}/${dateStr}/${type}/${hash}.html`);

      if ((await gzFile.exists()) || (await plainFile.exists())) {
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

    const shouldCompress = COMPRESSIBLE_EXTENSIONS.has(extension);

    for (let i = 0; i < 2; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const type = this.getContentType(url);
      const basePath = `${this.cacheDir}/${dateStr}/${type}/${hashUrl(url)}${extension}`;

      let content: string | undefined;

      if (shouldCompress) {
        // Try compressed first, then fall back to legacy uncompressed
        const gzFile = Bun.file(`${basePath}.gz`);
        if (await gzFile.exists()) {
          const compressed = await gzFile.arrayBuffer();
          content = Buffer.from(Bun.gunzipSync(new Uint8Array(compressed))).toString();
        } else {
          const plainFile = Bun.file(basePath);
          if (await plainFile.exists()) {
            content = await plainFile.text();
          }
        }
      } else {
        const file = Bun.file(basePath);
        if (await file.exists()) {
          content = await file.text();
        }
      }

      if (content !== undefined) {
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
    const shouldCompress = COMPRESSIBLE_EXTENSIONS.has(extension);
    const filename = this.getCacheFilePath(url, extension);
    const actualPath = shouldCompress ? `${filename}.gz` : filename;
    const file = Bun.file(actualPath);

    if (!force && (await file.exists())) {
      const cacheKey = `get:${url}:${extension}`;
      this.memoryCache.set(cacheKey, { content, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
      return actualPath;
    }

    if (shouldCompress) {
      const compressed = Bun.gzipSync(Buffer.from(content));
      await Bun.write(file, compressed);
    } else {
      await Bun.write(file, content);
    }

    const cacheKey = `get:${url}:${extension}`;
    this.memoryCache.set(cacheKey, { content, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
    this.pruneMemoryCache();

    return actualPath;
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

  /**
   * Removes cache directories older than FILE_CACHE_LOOKBACK_DAYS.
   * Called once on construction.
   */
  private purgeOldCacheDirs(): void {
    const validDates = new Set<string>();
    for (let i = 0; i < FILE_CACHE_LOOKBACK_DAYS; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const [dateStr] = date.toISOString().split("T");
      validDates.add(dateStr);
    }

    let entries: string[];
    try {
      entries = readdirSync(this.cacheDir);
    } catch {
      return;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    for (const entry of entries) {
      if (!datePattern.test(entry)) {
        continue;
      }
      if (validDates.has(entry)) {
        continue;
      }

      try {
        rmSync(`${this.cacheDir}/${entry}`, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup, ignore errors
      }
    }
  }
}
