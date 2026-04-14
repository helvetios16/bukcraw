import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { CacheManager } from "../../src/core/cache-manager";

const TEST_CACHE_DIR = "./cache-test-tmp";
const BOOK_URL = "https://www.goodreads.com/book/show/12345-test";
const BLOG_URL = "https://www.goodreads.com/blog/show/999";
const MISC_URL = "https://www.goodreads.com/search?q=test";

beforeEach(() => {
  rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
});

describe("CacheManager - gzip compression", () => {
  test("saves .html files as .html.gz", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const path = await cm.save({ url: BOOK_URL, content: "<html>test</html>" });

    expect(path).toEndWith(".html.gz");
    expect(await Bun.file(path).exists()).toBe(true);
  });

  test("compressed file is smaller than original content", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const content = `<html>${"x".repeat(10000)}</html>`;
    const path = await cm.save({ url: BOOK_URL, content, force: true });

    const fileSize = Bun.file(path).size;
    expect(fileSize).toBeLessThan(content.length);
  });

  test("reads back compressed content correctly", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const content = "<html><body>Hello World</body></html>";
    await cm.save({ url: BOOK_URL, content, force: true });

    // New instance to bypass memory cache
    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const result = await cm2.get(BOOK_URL, ".html");

    expect(result).toBe(content);
  });

  test("does not compress .json files", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const jsonContent = JSON.stringify({ title: "Test Book" });
    const path = await cm.save({ url: BOOK_URL, content: jsonContent, extension: ".json" });

    expect(path).toEndWith(".json");
    expect(path).not.toContain(".gz");

    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const result = await cm2.get(BOOK_URL, ".json");
    expect(result).toBe(jsonContent);
  });

  test("does not compress -parsed.json files", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const content = JSON.stringify({ parsed: true });
    const path = await cm.save({ url: BOOK_URL, content, extension: "-parsed.json" });

    expect(path).toEndWith("-parsed.json");
    expect(path).not.toContain(".gz");
  });
});

describe("CacheManager - backward compatibility", () => {
  test("reads legacy uncompressed .html files", async () => {
    const _cm = new CacheManager(TEST_CACHE_DIR);

    // Manually create an uncompressed .html file (simulating old cache)
    const today = new Date().toISOString().split("T")[0];
    const dir = `${TEST_CACHE_DIR}/${today}/books`;
    mkdirSync(dir, { recursive: true });

    const { hashUrl } = await import("../../src/utils/util");
    const hash = hashUrl(BOOK_URL);
    const legacyPath = `${dir}/${hash}.html`;
    writeFileSync(legacyPath, "<html>legacy content</html>");

    // New instance should find the uncompressed file
    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const result = await cm2.get(BOOK_URL, ".html");

    expect(result).toBe("<html>legacy content</html>");
  });

  test("prefers .html.gz over legacy .html when both exist", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const today = new Date().toISOString().split("T")[0];
    const dir = `${TEST_CACHE_DIR}/${today}/books`;
    mkdirSync(dir, { recursive: true });

    const { hashUrl } = await import("../../src/utils/util");
    const hash = hashUrl(BOOK_URL);

    // Write legacy plain file
    writeFileSync(`${dir}/${hash}.html`, "old content");

    // Write compressed file via CacheManager
    await cm.save({ url: BOOK_URL, content: "new compressed content", force: true });

    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const result = await cm2.get(BOOK_URL, ".html");
    expect(result).toBe("new compressed content");
  });
});

describe("CacheManager - has()", () => {
  test("returns true for existing cached URL", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    await cm.save({ url: BOOK_URL, content: "<html>test</html>" });

    expect(await cm.has(BOOK_URL)).toBe(true);
  });

  test("returns false for non-existent URL", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    expect(await cm.has("https://www.goodreads.com/book/show/99999-nope")).toBe(false);
  });

  test("detects legacy uncompressed files", async () => {
    const _cm = new CacheManager(TEST_CACHE_DIR);
    const today = new Date().toISOString().split("T")[0];
    const dir = `${TEST_CACHE_DIR}/${today}/books`;
    mkdirSync(dir, { recursive: true });

    const { hashUrl } = await import("../../src/utils/util");
    writeFileSync(`${dir}/${hashUrl(BOOK_URL)}.html`, "legacy");

    const cm2 = new CacheManager(TEST_CACHE_DIR);
    expect(await cm2.has(BOOK_URL)).toBe(true);
  });
});

describe("CacheManager - save()", () => {
  test("does not overwrite when force=false and file exists", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    await cm.save({ url: BOOK_URL, content: "first", force: true });
    await cm.save({ url: BOOK_URL, content: "second", force: false });

    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const result = await cm2.get(BOOK_URL, ".html");
    expect(result).toBe("first");
  });

  test("overwrites when force=true", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    await cm.save({ url: BOOK_URL, content: "first", force: true });
    await cm.save({ url: BOOK_URL, content: "updated", force: true });

    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const result = await cm2.get(BOOK_URL, ".html");
    expect(result).toBe("updated");
  });

  test("throws on invalid URL", () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    expect(cm.save({ url: "not-a-url", content: "x" })).rejects.toThrow("Invalid URL");
  });
});

describe("CacheManager - getOrFetch()", () => {
  test("returns cached content without calling fetcher", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    await cm.save({ url: BOOK_URL, content: "cached", force: true });

    let fetcherCalled = false;
    const result = await cm.getOrFetch(
      BOOK_URL,
      async () => {
        fetcherCalled = true;
        return "fetched";
      },
      ".html",
    );

    expect(result.content).toBe("cached");
    expect(result.fromCache).toBe(true);
    expect(fetcherCalled).toBe(false);
  });

  test("calls fetcher and caches result on miss", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);

    const result = await cm.getOrFetch(BOOK_URL, async () => "fetched content", ".html");

    expect(result.content).toBe("fetched content");
    expect(result.fromCache).toBe(false);

    // Verify it was cached
    const cm2 = new CacheManager(TEST_CACHE_DIR);
    const cached = await cm2.get(BOOK_URL, ".html");
    expect(cached).toBe("fetched content");
  });
});

describe("CacheManager - content type routing", () => {
  test("routes /book/ URLs to books directory", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const path = await cm.save({ url: BOOK_URL, content: "book" });
    expect(path).toContain("/books/");
  });

  test("routes /blog/ URLs to blog directory", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const path = await cm.save({ url: BLOG_URL, content: "blog" });
    expect(path).toContain("/blog/");
  });

  test("routes other URLs to misc directory", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    const path = await cm.save({ url: MISC_URL, content: "misc" });
    expect(path).toContain("/misc/");
  });
});

describe("CacheManager - auto-purge", () => {
  test("removes directories older than lookback window", () => {
    mkdirSync(TEST_CACHE_DIR, { recursive: true });

    // Create old date directories
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const oldDir = `${TEST_CACHE_DIR}/${oldDate.toISOString().split("T")[0]}`;
    mkdirSync(`${oldDir}/books`, { recursive: true });
    writeFileSync(`${oldDir}/books/test.html`, "old data");

    // Creating CacheManager triggers purge
    new CacheManager(TEST_CACHE_DIR);

    const { existsSync } = require("node:fs");
    expect(existsSync(oldDir)).toBe(false);
  });

  test("preserves directories within lookback window", () => {
    mkdirSync(TEST_CACHE_DIR, { recursive: true });

    // Create today's directory
    const today = new Date().toISOString().split("T")[0];
    const todayDir = `${TEST_CACHE_DIR}/${today}`;
    mkdirSync(`${todayDir}/books`, { recursive: true });
    writeFileSync(`${todayDir}/books/test.html`, "today data");

    new CacheManager(TEST_CACHE_DIR);

    const { existsSync } = require("node:fs");
    expect(existsSync(todayDir)).toBe(true);
  });

  test("ignores non-date directories", () => {
    mkdirSync(TEST_CACHE_DIR, { recursive: true });
    mkdirSync(`${TEST_CACHE_DIR}/some-other-dir`, { recursive: true });
    writeFileSync(`${TEST_CACHE_DIR}/some-other-dir/file.txt`, "keep me");

    new CacheManager(TEST_CACHE_DIR);

    const { existsSync } = require("node:fs");
    expect(existsSync(`${TEST_CACHE_DIR}/some-other-dir`)).toBe(true);
  });
});

describe("CacheManager - memory cache", () => {
  test("serves from memory cache on second read", async () => {
    const cm = new CacheManager(TEST_CACHE_DIR);
    await cm.save({ url: BOOK_URL, content: "memory test", force: true });

    // First read populates memory (already in memory from save)
    const result1 = await cm.get(BOOK_URL, ".html");

    // Delete the file on disk — memory cache should still serve it
    const { hashUrl } = await import("../../src/utils/util");
    const today = new Date().toISOString().split("T")[0];
    const hash = hashUrl(BOOK_URL);
    rmSync(`${TEST_CACHE_DIR}/${today}/books/${hash}.html.gz`, { force: true });

    const result2 = await cm.get(BOOK_URL, ".html");
    expect(result1).toBe("memory test");
    expect(result2).toBe("memory test");
  });
});
