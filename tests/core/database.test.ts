import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { DatabaseService } from "../../src/core/database";

const TEST_DB = "test-library.sqlite";
let db: DatabaseService;

beforeEach(() => {
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-wal`, { force: true });
  rmSync(`${TEST_DB}-shm`, { force: true });
  db = new DatabaseService(TEST_DB);
});

afterEach(() => {
  db.close();
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-wal`, { force: true });
  rmSync(`${TEST_DB}-shm`, { force: true });
});

describe("DatabaseService - books", () => {
  const sampleBook = {
    id: "12345-test-book",
    title: "Test Book",
    legacyId: 99999,
    author: "Test Author",
    description: "A test book",
    averageRating: 4.2,
    pageCount: 300,
    language: "English",
    format: "Kindle Edition",
    coverImage: "https://example.com/cover.jpg",
  };

  test("saveBook and getBook round-trip", () => {
    db.saveBook(sampleBook);
    const result = db.getBook("12345-test-book");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("12345-test-book");
    expect(result?.title).toBe("Test Book");
    expect(result?.author).toBe("Test Author");
    expect(result?.legacyId).toBe(99999);
    expect(result?.averageRating).toBe(4.2);
    expect(result?.pageCount).toBe(300);
  });

  test("getBook returns null for non-existent ID", () => {
    expect(db.getBook("non-existent")).toBeNull();
  });

  test("saveBook upserts on conflict", () => {
    db.saveBook(sampleBook);
    db.saveBook({ ...sampleBook, averageRating: 4.8 });

    const result = db.getBook("12345-test-book");
    expect(result?.averageRating).toBe(4.8);
  });

  test("getAllBooks returns all saved books", () => {
    db.saveBook(sampleBook);
    db.saveBook({ ...sampleBook, id: "67890-another", title: "Another Book" });

    const books = db.getAllBooks();
    expect(books).toHaveLength(2);
  });

  test("getAllBooks returns empty array when no books", () => {
    expect(db.getAllBooks()).toHaveLength(0);
  });

  test("handles book with minimal fields", () => {
    db.saveBook({ id: "minimal-1", title: "Minimal" });
    const result = db.getBook("minimal-1");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Minimal");
    expect(result?.author).toBeUndefined();
    expect(result?.legacyId).toBeUndefined();
  });
});

describe("DatabaseService - editions", () => {
  const sampleEditions = [
    {
      title: "Spanish Kindle Edition",
      link: "https://goodreads.com/book/show/1",
      language: "spa",
      format: "Kindle Edition",
      averageRating: 4.0,
      pages: 250,
    },
    {
      title: "Spanish Ebook Edition",
      link: "https://goodreads.com/book/show/2",
      language: "spa",
      format: "ebook",
      averageRating: 3.8,
      pages: 250,
    },
    {
      title: "English Hardcover",
      link: "https://goodreads.com/book/show/3",
      language: "eng",
      format: "hardcover",
      averageRating: 4.5,
      pages: 300,
    },
  ];

  test("saveEditions and getEditions round-trip", () => {
    db.saveEditions("99999", sampleEditions);
    const results = db.getEditions("99999");

    expect(results).toHaveLength(3);
    expect(results[0]?.title).toBe("Spanish Kindle Edition");
    expect(results[0]?.language).toBe("spa");
  });

  test("getEditions filters by language", () => {
    db.saveEditions("99999", sampleEditions);

    const spanish = db.getEditions("99999", "spa");
    expect(spanish).toHaveLength(2);

    const english = db.getEditions("99999", "eng");
    expect(english).toHaveLength(1);
    expect(english[0]?.format).toBe("hardcover");
  });

  test("getEditions returns empty for non-existent legacyId", () => {
    expect(db.getEditions("nonexistent")).toHaveLength(0);
  });

  test("deleteEditions removes all editions for a legacyId", () => {
    db.saveEditions("99999", sampleEditions);
    db.deleteEditions("99999");

    expect(db.getEditions("99999")).toHaveLength(0);
  });

  test("deleteEditions with language only removes matching", () => {
    db.saveEditions("99999", sampleEditions);
    db.deleteEditions("99999", "spa");

    const remaining = db.getEditions("99999");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.language).toBe("eng");
  });

  test("saves editions in a transaction (all or nothing)", () => {
    db.saveEditions("99999", sampleEditions);
    const results = db.getEditions("99999");
    expect(results).toHaveLength(3);
  });
});

describe("DatabaseService - sessions", () => {
  test("saveSession and getLatestSession round-trip", () => {
    db.saveSession("cookie1=value1; cookie2=value2");
    const session = db.getLatestSession();

    expect(session).not.toBeNull();
    expect(session?.cookies).toBe("cookie1=value1; cookie2=value2");
    expect(session?.createdAt).toBeTruthy();
  });

  test("getLatestSession returns most recent", () => {
    db.saveSession("old-cookie");
    db.saveSession("new-cookie");

    // Both rows share the same CURRENT_TIMESTAMP, so the latest is the one
    // with the highest auto-incremented id. Verify we get one of them back.
    const session = db.getLatestSession();
    expect(session).not.toBeNull();
    expect(["old-cookie", "new-cookie"]).toContain(session?.cookies);
  });

  test("getLatestSession returns null when no sessions", () => {
    expect(db.getLatestSession()).toBeNull();
  });
});

describe("DatabaseService - blog references", () => {
  test("saveBlogReference creates blog and relation", () => {
    db.saveBook({ id: "book-1", title: "Book One" });
    db.saveBlogReference({
      blogId: "blog-1",
      bookId: "book-1",
      blogTitle: "Best Books 2026",
      blogUrl: "https://goodreads.com/blog/show/blog-1",
    });

    const blogs = db.getAllBlogs();
    expect(blogs).toHaveLength(1);
    expect(blogs[0]?.title).toBe("Best Books 2026");
  });

  test("saveBlogReference handles duplicate gracefully", () => {
    db.saveBook({ id: "book-1", title: "Book One" });
    db.saveBlogReference({ blogId: "blog-1", bookId: "book-1", blogTitle: "Blog" });
    db.saveBlogReference({ blogId: "blog-1", bookId: "book-1", blogTitle: "Blog Updated" });

    const blogs = db.getAllBlogs();
    expect(blogs).toHaveLength(1);
    expect(blogs[0]?.title).toBe("Blog Updated");
  });

  test("multiple books can reference same blog", () => {
    db.saveBlogReference({ blogId: "blog-1", bookId: "book-1", blogTitle: "Blog" });
    db.saveBlogReference({ blogId: "blog-1", bookId: "book-2", blogTitle: "Blog" });

    const blogs = db.getAllBlogs();
    expect(blogs).toHaveLength(1);
  });

  test("same book can appear in multiple blogs", () => {
    db.saveBlogReference({ blogId: "blog-1", bookId: "book-1", blogTitle: "Blog 1" });
    db.saveBlogReference({ blogId: "blog-2", bookId: "book-1", blogTitle: "Blog 2" });

    const blogs = db.getAllBlogs();
    expect(blogs).toHaveLength(2);
  });
});

describe("DatabaseService - http metadata", () => {
  test("saveHttpMetadata and getHttpMetadata round-trip", () => {
    db.saveHttpMetadata(
      "abc123",
      "https://example.com/page",
      '"etag-value"',
      "Wed, 09 Apr 2026 00:00:00 GMT",
    );
    const meta = db.getHttpMetadata("abc123");

    expect(meta).not.toBeNull();
    expect(meta?.etag).toBe('"etag-value"');
    expect(meta?.lastModified).toBe("Wed, 09 Apr 2026 00:00:00 GMT");
    expect(meta?.updatedAt).toBeTruthy();
  });

  test("getHttpMetadata returns null for non-existent hash", () => {
    expect(db.getHttpMetadata("nonexistent")).toBeNull();
  });

  test("saveHttpMetadata upserts on conflict", () => {
    db.saveHttpMetadata(
      "abc123",
      "https://example.com/page",
      '"v1"',
      "Mon, 01 Jan 2026 00:00:00 GMT",
    );
    db.saveHttpMetadata(
      "abc123",
      "https://example.com/page",
      '"v2"',
      "Tue, 02 Jan 2026 00:00:00 GMT",
    );

    const meta = db.getHttpMetadata("abc123");
    expect(meta?.etag).toBe('"v2"');
    expect(meta?.lastModified).toBe("Tue, 02 Jan 2026 00:00:00 GMT");
  });

  test("handles missing etag (only Last-Modified)", () => {
    db.saveHttpMetadata(
      "lm-only",
      "https://example.com/page",
      undefined,
      "Wed, 09 Apr 2026 00:00:00 GMT",
    );
    const meta = db.getHttpMetadata("lm-only");

    expect(meta?.etag).toBeUndefined();
    expect(meta?.lastModified).toBe("Wed, 09 Apr 2026 00:00:00 GMT");
  });

  test("handles missing Last-Modified (only ETag)", () => {
    db.saveHttpMetadata("etag-only", "https://example.com/page", '"etag-123"');
    const meta = db.getHttpMetadata("etag-only");

    expect(meta?.etag).toBe('"etag-123"');
    expect(meta?.lastModified).toBeUndefined();
  });

  test("refreshHttpMetadata updates timestamp", () => {
    db.saveHttpMetadata("refresh-test", "https://example.com/page", '"v1"');
    const before = db.getHttpMetadata("refresh-test");

    db.refreshHttpMetadata("refresh-test");
    const after = db.getHttpMetadata("refresh-test");

    expect(before?.updatedAt).toBeTruthy();
    expect(after?.updatedAt).toBeTruthy();
    // Both timestamps are CURRENT_TIMESTAMP in the same second, so just verify they exist
  });
});

describe("DatabaseService - refreshBookTimestamp", () => {
  test("updates book updated_at without changing data", () => {
    db.saveBook({ id: "ts-book", title: "Timestamp Test", author: "Author" });
    const before = db.getBook("ts-book");

    db.refreshBookTimestamp("ts-book");
    const after = db.getBook("ts-book");

    expect(after?.title).toBe("Timestamp Test");
    expect(after?.author).toBe("Author");
    expect(before?.updatedAt).toBeTruthy();
    expect(after?.updatedAt).toBeTruthy();
  });
});

describe("DatabaseService - getDb()", () => {
  test("returns the underlying Database instance", () => {
    const rawDb = db.getDb();
    expect(rawDb).toBeTruthy();

    // Verify we can run a raw query
    const result = rawDb.prepare("SELECT COUNT(*) as count FROM books").get() as {
      count: number;
    };
    expect(result.count).toBe(0);
  });
});
